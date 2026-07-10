package store

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"
)

func newID(prefix string) string {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
	}
	return fmt.Sprintf("%s-%d-%s", prefix, time.Now().UnixNano(), hex.EncodeToString(b[:]))
}

func SafeName(name string) string {
	name = strings.TrimSpace(name)
	name = strings.ReplaceAll(name, "\\", "-")
	name = strings.ReplaceAll(name, "/", "-")
	name = strings.ReplaceAll(name, ":", "-")
	name = strings.ReplaceAll(name, "*", "-")
	name = strings.ReplaceAll(name, "?", "-")
	name = strings.ReplaceAll(name, "\"", "-")
	name = strings.ReplaceAll(name, "<", "-")
	name = strings.ReplaceAll(name, ">", "-")
	name = strings.ReplaceAll(name, "|", "-")
	if name == "" {
		return "untitled"
	}
	return name
}

func NewConversationID() string { return newID("conv") }
func NewTurnID() string         { return newID("turn") }
func NewTaskID() string         { return newID("task") }
func NewAutomationID() string   { return newID("automation") }
func NewRecordID() string       { return newID("rec") }
func NewArtifactID() string     { return newID("artifact") }
func NewDocumentID() string     { return newID("doc") }
