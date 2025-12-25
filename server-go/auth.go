package main

import (
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

var jwtSecret = []byte(func() string {
	if s := os.Getenv("JWT_SECRET"); s != "" {
		return s
	}
	return "devsecret"
}())

func GenerateToken(userId primitive.ObjectID) (string, error) {
	claims := jwt.MapClaims{
		"userId": userId.Hex(),
		"exp":    time.Now().Add(72 * time.Hour).Unix(),
		"iat":    time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

func ParseToken(tokenStr string) (primitive.ObjectID, error) {
	tok, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		return jwtSecret, nil
	})
	if err != nil || !tok.Valid {
		return primitive.NilObjectID, err
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return primitive.NilObjectID, nil
	}
	userHex, ok := claims["userId"].(string)
	if !ok {
		return primitive.NilObjectID, nil
	}
	return primitive.ObjectIDFromHex(userHex)
}
