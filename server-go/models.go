package main

import "go.mongodb.org/mongo-driver/bson/primitive"

type User struct {
	ID       primitive.ObjectID `bson:"_id,omitempty" json:"_id"`
	Username string             `bson:"username" json:"username"` // THÊM DÒNG NÀY
	Email    string             `bson:"email" json:"email"`
	Password string             `bson:"password" json:"-"` // không trả password ra client
}

type Task struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	UserID    primitive.ObjectID `bson:"userId" json:"userId"`
	Text      string             `bson:"text" json:"text"`
	Completed bool               `bson:"completed" json:"completed"`
	CreatedAt int64              `bson:"createdAt" json:"createdAt"`
}
