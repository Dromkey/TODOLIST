package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/joho/godotenv"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var mongoClient *mongo.Client

func getEnv(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return v
}

func loadEnv() {
	_ = godotenv.Load() // ignore error if no .env
}

func connectMongo() *mongo.Client {
	if mongoClient != nil {
		return mongoClient
	}
	uri := os.Getenv("MONGO_URI")
	if uri == "" {
		uri = getEnv("MONGO_URI", "mongodb://localhost:27017")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	clientOpts := options.Client().ApplyURI(uri)
	client, err := mongo.Connect(ctx, clientOpts)
	if err != nil {
		log.Fatalf("mongo connect error: %v", err)
	}
	// ping
	if err := client.Ping(ctx, nil); err != nil {
		log.Fatalf("mongo ping error: %v", err)
	}
	mongoClient = client
	return mongoClient
}
