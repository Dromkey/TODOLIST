package main

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"golang.org/x/crypto/bcrypt"
)

var userColl *mongo.Collection

func getUserColl() *mongo.Collection {
	if userColl != nil {
		return userColl
	}
	client := connectMongo()
	db := getEnv("DB_NAME", "mytodo")
	userColl = client.Database(db).Collection("users")
	return userColl
}

type registerReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Username string `json:"username"`
}

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Register handler
func Register(w http.ResponseWriter, r *http.Request) {
	var req registerReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	// Validate input
	if req.Email == "" || req.Password == "" || req.Username == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "email, password and username are required"})
		return
	}

	c := getUserColl()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Check if user already exists
	var existingUser User
	err := c.FindOne(ctx, bson.M{"email": req.Email}).Decode(&existingUser)
	if err == nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "user already exists"})
		return
	}

hashedPassword, err := bcrypt.GenerateFromPassword(
    []byte(req.Password),
    bcrypt.DefaultCost,
)
if err != nil {
    writeJSON(w, http.StatusInternalServerError, map[string]string{
        "error": "could not hash password",
    })
    return
}


	// Create new user
	newUser := User{
		Email:    req.Email,
		Password: string(hashedPassword),
		Username: req.Username,
	}

	result, err := c.InsertOne(ctx, newUser)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not create user"})
		return
	}

	// Get inserted ID
	insertedID, ok := result.InsertedID.(primitive.ObjectID)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not get user ID"})
		return
	}

	// Generate JWT token
	tokenString, err := GenerateToken(insertedID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not generate token"})
		return
	}

	// Return token and user info
	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"token": tokenString,
		"user": map[string]interface{}{
			"_id":      insertedID.Hex(),
			"email":    req.Email,
			"username": req.Username,
		},
	})
}

// Login handler
func Login(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	c := getUserColl()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var user User
	err := c.FindOne(ctx, bson.M{"email": req.Email}).Decode(&user)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
		return
	}

	// Verify password
	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password))
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
		return
	}

	// Generate JWT token
	tokenString, err := GenerateToken(user.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not generate token"})
		return
	}

	// Return token and user info
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"token": tokenString,
		"user": map[string]interface{}{
			"_id":      user.ID.Hex(),
			"email":    user.Email,
			"username": user.Username,
		},
	})
}
