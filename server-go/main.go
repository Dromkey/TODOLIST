package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gorilla/mux"
	"github.com/rs/cors"
)

func main() {
	loadEnv()

	// THAY ĐỔI: Dùng connectMongo() thay vì initDB()
	connectMongo()
	log.Println("✅ Connected to MongoDB!")

	r := mux.NewRouter()

	api := r.PathPrefix("/api").Subrouter()

	// public auth endpoints
	api.HandleFunc("/register", Register).Methods("POST")
	api.HandleFunc("/login", Login).Methods("POST")

	// protected routes
	private := api.NewRoute().Subrouter()
	private.Use(AuthMiddleware)
	private.HandleFunc("/tasks", GetTasks).Methods("GET")
	private.HandleFunc("/tasks", CreateTask).Methods("POST")
	private.HandleFunc("/tasks/{id}", DeleteTask).Methods("DELETE")
	private.HandleFunc("/tasks/{id}", UpdateTask).Methods("PUT", "PATCH")

	// CORS - allow React dev on localhost:3000
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://127.0.0.1:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	})

	handler := c.Handler(r)

	port := os.Getenv("PORT")
	if port == "" {
		port = "5000"
	}
	log.Printf("🚀 Server running on :%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, handler))
}
