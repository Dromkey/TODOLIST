package main

import (
	"net/http"
	"strings"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if auth == "" || !strings.HasPrefix(auth, "Bearer ") {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "no token"})
			return
		}
		token := strings.TrimPrefix(auth, "Bearer ")
		uid, err := ParseToken(token)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid token"})
			return
		}
		// set user id in header for handlers
		r.Header.Set("X-USER-ID", uid.Hex())
		// also attach a typed object in context if desired (optional)
		_ = uid // currently not adding to context
		next.ServeHTTP(w, r)
	})
}

// helper to parse userId header to ObjectID
func userIdFromRequest(r *http.Request) (primitive.ObjectID, error) {
	hex := r.Header.Get("X-USER-ID")
	return primitive.ObjectIDFromHex(hex)
}
