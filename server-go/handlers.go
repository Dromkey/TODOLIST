package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/mux"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

var taskColl *mongo.Collection

func getTaskColl() *mongo.Collection {
	if taskColl != nil {
		return taskColl
	}
	client := connectMongo()
	db := os.Getenv("DB_NAME")
	if db == "" {
		db = "mytodo"
	}
	collectionName := os.Getenv("COLLECTION_NAME")
	if collectionName == "" {
		collectionName = "tasks"
	}
	taskColl = client.Database(db).Collection(collectionName)
	return taskColl
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

// GET /api/tasks  (only tasks of authenticated user)
func GetTasks(w http.ResponseWriter, r *http.Request) {
	userIdHex := r.Header.Get("X-USER-ID")
	uid, err := primitive.ObjectIDFromHex(userIdHex)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid user"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c := getTaskColl()

	cursor, err := c.Find(ctx, bson.M{"userId": uid})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	var tasks []Task
	if err := cursor.All(ctx, &tasks); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, tasks)
}

type createReq struct {
	Text string `json:"text"`
}

func CreateTask(w http.ResponseWriter, r *http.Request) {
	userIdHex := r.Header.Get("X-USER-ID")
	uid, err := primitive.ObjectIDFromHex(userIdHex)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid user"})
		return
	}
	var req createReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	if req.Text == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "text required"})
		return
	}

	c := getTaskColl()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	t := Task{
		UserID:    uid,
		Text:      req.Text,
		Completed: false,
		CreatedAt: time.Now().Unix(),
	}
	res, err := c.InsertOne(ctx, t)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{"insertedId": res.InsertedID})
}

func DeleteTask(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	userIdHex := r.Header.Get("X-USER-ID")
	uid, err := primitive.ObjectIDFromHex(userIdHex)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid user"})
		return
	}
	c := getTaskColl()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	res, err := c.DeleteOne(ctx, bson.M{"_id": oid, "userId": uid})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if res.DeletedCount == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"deleted": id})
}

type updateReq struct {
	Text      *string `json:"text,omitempty"`
	Completed *bool   `json:"completed,omitempty"`
}

func UpdateTask(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	userIdHex := r.Header.Get("X-USER-ID")
	uid, err := primitive.ObjectIDFromHex(userIdHex)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid user"})
		return
	}

	var req updateReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	update := bson.M{}
	if req.Text != nil {
		update["text"] = *req.Text
	}
	if req.Completed != nil {
		update["completed"] = *req.Completed
	}
	if len(update) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "nothing to update"})
		return
	}
	c := getTaskColl()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	res, err := c.UpdateOne(ctx, bson.M{"_id": oid, "userId": uid}, bson.M{"$set": update})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if res.MatchedCount == 0 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found or not allowed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"updated": id})
}
