package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/agent"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/model"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/store"
)

type Server struct {
	store      *store.Store
	agent      *agent.Service
	webDist    string
	enableCORS bool
}

func New(store *store.Store, agentService *agent.Service, webDist string) *Server {
	return &Server{
		store:      store,
		agent:      agentService,
		webDist:    webDist,
		enableCORS: true,
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	for path, handler := range map[string]http.HandlerFunc{
		"/api/v1/createAgentSpace":   s.createAgentSpace,
		"/api/v1/listAgentSpaces":    s.listAgentSpaces,
		"/api/v1/getAgentSpace":      s.getAgentSpace,
		"/api/v1/updateAgentSpace":   s.updateAgentSpace,
		"/api/v1/deleteAgentSpace":   s.deleteAgentSpace,
		"/api/v1/createConversation": s.createConversation,
		"/api/v1/listConversations":  s.listConversations,
		"/api/v1/getConversation":    s.getConversation,
		"/api/v1/deleteConversation": s.deleteConversation,
		"/api/v1/createTurn":         s.createTurn,
		"/api/v1/getTurn":            s.getTurn,
		"/api/v1/createTask":         s.createTask,
		"/api/v1/getTask":            s.getTask,
		"/api/v1/listTasks":          s.listTasks,
		"/api/v1/deleteTask":         s.deleteTask,
		"/api/v1/respondToTask":      s.respondToTask,
		"/api/v1/listRecords":        s.listRecords,
		"/api/v1/listArtifacts":      s.listArtifacts,
		"/api/v1/getArtifact":        s.getArtifact,
		"/api/v1/createDocument":     s.createDocument,
		"/api/v1/listDocuments":      s.listDocuments,
		"/api/v1/getDocument":        s.getDocument,
		"/api/v1/deleteDocument":     s.deleteDocument,
		"/api/v1/healthz":            s.healthz,
	} {
		mux.Handle(path, s.postOnly(handler))
	}
	mux.Handle("/", s.staticHandler())
	return s.withMiddleware(mux)
}

func (s *Server) withMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.enableCORS {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Headers", "content-type, authorization")
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) postOnly(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/healthz" && r.Method == http.MethodGet {
			next(w, r)
			return
		}
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "method must be POST")
			return
		}
		next(w, r)
	}
}

func (s *Server) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) createAgentSpace(w http.ResponseWriter, r *http.Request) {
	var req createAgentSpaceRequest
	if !decode(w, r, &req) {
		return
	}
	environment, err := normalizeEnvironment(req.Environment)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	space, err := s.store.CreateAgentSpace(r.Context(), model.AgentSpace{
		Name:         req.Name,
		Description:  req.Description,
		LLM:          req.LLM,
		Environment:  environment,
		Integrations: req.Integrations,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, entity(space))
}

func (s *Server) listAgentSpaces(w http.ResponseWriter, r *http.Request) {
	spaces, err := s.store.ListAgentSpaces(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, model.Page[model.AgentSpace]{Entities: spaces})
}

func (s *Server) getAgentSpace(w http.ResponseWriter, r *http.Request) {
	var req agentSpaceIDRequest
	if !decode(w, r, &req) {
		return
	}
	space, err := s.store.GetAgentSpace(r.Context(), req.AgentSpaceID)
	if err != nil {
		writeNotFoundOrError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, entity(space))
}

func (s *Server) updateAgentSpace(w http.ResponseWriter, r *http.Request) {
	var req updateAgentSpaceRequest
	if !decode(w, r, &req) {
		return
	}
	environment, err := normalizeEnvironment(req.Environment)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	space, err := s.store.UpdateAgentSpace(r.Context(), model.AgentSpace{
		ID:           req.AgentSpaceID,
		Name:         req.Name,
		Description:  req.Description,
		LLM:          req.LLM,
		Environment:  environment,
		Integrations: req.Integrations,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, entity(space))
}

func (s *Server) deleteAgentSpace(w http.ResponseWriter, r *http.Request) {
	var req agentSpaceIDRequest
	if !decode(w, r, &req) {
		return
	}
	if err := s.store.DeleteAgentSpace(r.Context(), req.AgentSpaceID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, entity(map[string]string{"agentSpaceId": req.AgentSpaceID}))
}

func (s *Server) createConversation(w http.ResponseWriter, r *http.Request) {
	var req createConversationRequest
	if !decode(w, r, &req) {
		return
	}
	conv, err := s.store.CreateConversation(r.Context(), req.AgentSpaceID, req.Title)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, entity(conv))
}

func (s *Server) listConversations(w http.ResponseWriter, r *http.Request) {
	var req listByAgentRequest
	if !decode(w, r, &req) {
		return
	}
	conversations, err := s.store.ListConversations(r.Context(), req.AgentSpaceID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, model.Page[model.Conversation]{Entities: applyLimit(conversations, req.MaxResults)})
}

func (s *Server) getConversation(w http.ResponseWriter, r *http.Request) {
	var req conversationIDRequest
	if !decode(w, r, &req) {
		return
	}
	conv, err := s.store.GetConversation(r.Context(), req.AgentSpaceID, req.ConversationID)
	if err != nil {
		writeNotFoundOrError(w, err)
		return
	}
	turns, _ := s.store.ListTurns(r.Context(), req.AgentSpaceID, req.ConversationID)
	writeJSON(w, http.StatusOK, map[string]any{"entity": conv, "turns": turns})
}

func (s *Server) deleteConversation(w http.ResponseWriter, r *http.Request) {
	var req conversationIDRequest
	if !decode(w, r, &req) {
		return
	}
	if err := s.store.DeleteConversation(r.Context(), req.AgentSpaceID, req.ConversationID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, entity(map[string]string{"conversationId": req.ConversationID}))
}

func (s *Server) createTurn(w http.ResponseWriter, r *http.Request) {
	var req createTurnRequest
	if !decode(w, r, &req) {
		return
	}
	turn, err := s.agent.CreateTurn(r.Context(), req.AgentSpaceID, req.ConversationID, req.Prompt)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"turn": turn})
}

func (s *Server) getTurn(w http.ResponseWriter, r *http.Request) {
	var req turnIDRequest
	if !decode(w, r, &req) {
		return
	}
	turn, err := s.store.GetTurn(r.Context(), req.AgentSpaceID, req.ConversationID, req.TurnID)
	if err != nil {
		writeNotFoundOrError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"turn": turn})
}

func (s *Server) createTask(w http.ResponseWriter, r *http.Request) {
	var req createTaskRequest
	if !decode(w, r, &req) {
		return
	}
	task, err := s.agent.CreateTask(r.Context(), model.Task{
		AgentSpaceID:     req.AgentSpaceID,
		Name:             req.Name,
		Description:      req.Description,
		Priority:         req.Priority,
		Type:             req.Type,
		Source:           model.TaskSourceManual,
		Instruction:      req.Instruction,
		Input:            req.Input,
		RequiresApproval: req.RequiresApproval,
		PreAuthorized:    req.PreAuthorized,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, entity(task))
}

func (s *Server) getTask(w http.ResponseWriter, r *http.Request) {
	var req taskIDRequest
	if !decode(w, r, &req) {
		return
	}
	task, err := s.store.GetTask(r.Context(), req.AgentSpaceID, req.TaskID)
	if err != nil {
		writeNotFoundOrError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, entity(task))
}

func (s *Server) listTasks(w http.ResponseWriter, r *http.Request) {
	var req listByAgentRequest
	if !decode(w, r, &req) {
		return
	}
	tasks, err := s.store.ListTasks(r.Context(), req.AgentSpaceID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, model.Page[model.Task]{Entities: applyLimit(tasks, req.MaxResults)})
}

func (s *Server) deleteTask(w http.ResponseWriter, r *http.Request) {
	var req taskIDRequest
	if !decode(w, r, &req) {
		return
	}
	if err := s.store.DeleteTask(r.Context(), req.AgentSpaceID, req.TaskID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, entity(map[string]string{"taskId": req.TaskID}))
}

func (s *Server) respondToTask(w http.ResponseWriter, r *http.Request) {
	var req respondToTaskRequest
	if !decode(w, r, &req) {
		return
	}
	task, err := s.agent.RespondToTask(r.Context(), req.AgentSpaceID, req.TaskID, req.Response, req.UserID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, entity(task))
}

func (s *Server) listRecords(w http.ResponseWriter, r *http.Request) {
	var req listRecordsRequest
	if !decode(w, r, &req) {
		return
	}
	records, err := s.store.ListRecords(r.Context(), req.AgentSpaceID, req.TaskID, req.ConversationID, req.TurnID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"records":   applyLimit(records, req.MaxResults),
		"nextToken": nil,
	})
}

func (s *Server) listArtifacts(w http.ResponseWriter, r *http.Request) {
	var req listByAgentRequest
	if !decode(w, r, &req) {
		return
	}
	artifacts, err := s.store.ListArtifacts(r.Context(), req.AgentSpaceID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, model.Page[model.Artifact]{Entities: applyLimit(artifacts, req.MaxResults)})
}

func (s *Server) getArtifact(w http.ResponseWriter, r *http.Request) {
	var req artifactIDRequest
	if !decode(w, r, &req) {
		return
	}
	artifact, content, err := s.store.GetArtifact(r.Context(), req.AgentSpaceID, req.ArtifactID)
	if err != nil {
		writeNotFoundOrError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"entity":  artifact,
		"content": string(content),
	})
}

func (s *Server) createDocument(w http.ResponseWriter, r *http.Request) {
	var req createDocumentRequest
	if !decode(w, r, &req) {
		return
	}
	doc, err := s.store.CreateDocument(r.Context(), req.AgentSpaceID, req.Name, req.ContentType, req.ContentBase64)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, entity(doc))
}

func (s *Server) listDocuments(w http.ResponseWriter, r *http.Request) {
	var req listDocumentsRequest
	if !decode(w, r, &req) {
		return
	}
	docs, err := s.store.ListDocuments(r.Context(), req.AgentSpaceID, req.IncludeInactive)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, model.Page[model.Document]{Entities: applyLimit(docs, req.MaxResults)})
}

func (s *Server) getDocument(w http.ResponseWriter, r *http.Request) {
	var req documentIDRequest
	if !decode(w, r, &req) {
		return
	}
	doc, err := s.store.GetDocument(r.Context(), req.AgentSpaceID, req.DocumentID)
	if err != nil {
		writeNotFoundOrError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, entity(doc))
}

func (s *Server) deleteDocument(w http.ResponseWriter, r *http.Request) {
	var req documentIDRequest
	if !decode(w, r, &req) {
		return
	}
	doc, err := s.store.DeleteDocument(r.Context(), req.AgentSpaceID, req.DocumentID)
	if err != nil {
		writeNotFoundOrError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, entity(doc))
}

func (s *Server) staticHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			writeError(w, http.StatusNotFound, "not found")
			return
		}
		dist := s.webDist
		if dist == "" {
			dist = filepath.Join(".", "web", "dist")
		}
		path := filepath.Clean(filepath.Join(dist, r.URL.Path))
		if !strings.HasPrefix(path, filepath.Clean(dist)) {
			writeError(w, http.StatusBadRequest, "invalid path")
			return
		}
		info, err := os.Stat(path)
		if err != nil || info.IsDir() {
			path = filepath.Join(dist, "index.html")
		}
		http.ServeFile(w, r, path)
	})
}

type createAgentSpaceRequest struct {
	Name         string             `json:"name"`
	Description  string             `json:"description"`
	LLM          model.LLMConfig    `json:"llm"`
	Environment  model.EnvVars      `json:"environment"`
	Integrations model.Integrations `json:"integrations"`
	ClientToken  string             `json:"clientToken"`
}

type updateAgentSpaceRequest struct {
	AgentSpaceID string             `json:"agentSpaceId"`
	Name         string             `json:"name"`
	Description  string             `json:"description"`
	LLM          model.LLMConfig    `json:"llm"`
	Environment  model.EnvVars      `json:"environment"`
	Integrations model.Integrations `json:"integrations"`
	ClientToken  string             `json:"clientToken"`
}

type agentSpaceIDRequest struct {
	AgentSpaceID string `json:"agentSpaceId"`
}

type listByAgentRequest struct {
	AgentSpaceID string `json:"agentSpaceId"`
	MaxResults   int    `json:"maxResults"`
	NextToken    string `json:"nextToken"`
}

type createConversationRequest struct {
	AgentSpaceID string `json:"agentSpaceId"`
	Title        string `json:"title"`
	ClientToken  string `json:"clientToken"`
}

type conversationIDRequest struct {
	AgentSpaceID   string `json:"agentSpaceId"`
	ConversationID string `json:"conversationId"`
}

type createTurnRequest struct {
	AgentSpaceID   string `json:"agentSpaceId"`
	ConversationID string `json:"conversationId"`
	Prompt         string `json:"prompt"`
	ClientToken    string `json:"clientToken"`
}

type turnIDRequest struct {
	AgentSpaceID   string `json:"agentSpaceId"`
	ConversationID string `json:"conversationId"`
	TurnID         string `json:"turnId"`
}

type createTaskRequest struct {
	AgentSpaceID     string            `json:"agentSpaceId"`
	Name             string            `json:"name"`
	Description      string            `json:"description"`
	Priority         string            `json:"priority"`
	Type             string            `json:"type"`
	Instruction      string            `json:"instruction"`
	Input            map[string]string `json:"input"`
	RequiresApproval bool              `json:"requiresApproval"`
	PreAuthorized    bool              `json:"preAuthorized"`
	ClientToken      string            `json:"clientToken"`
}

type taskIDRequest struct {
	AgentSpaceID string `json:"agentSpaceId"`
	TaskID       string `json:"taskId"`
}

type respondToTaskRequest struct {
	AgentSpaceID string `json:"agentSpaceId"`
	TaskID       string `json:"taskId"`
	Response     string `json:"response"`
	UserID       string `json:"userId"`
}

type listRecordsRequest struct {
	AgentSpaceID   string `json:"agentSpaceId"`
	TaskID         string `json:"taskId"`
	ConversationID string `json:"conversationId"`
	TurnID         string `json:"turnId"`
	MaxResults     int    `json:"maxResults"`
	NextToken      string `json:"nextToken"`
}

type artifactIDRequest struct {
	AgentSpaceID string `json:"agentSpaceId"`
	ArtifactID   string `json:"artifactId"`
}

type createDocumentRequest struct {
	AgentSpaceID  string `json:"agentSpaceId"`
	Name          string `json:"name"`
	ContentType   string `json:"contentType"`
	ContentBase64 string `json:"contentBase64"`
	ClientToken   string `json:"clientToken"`
}

type listDocumentsRequest struct {
	AgentSpaceID    string `json:"agentSpaceId"`
	IncludeInactive bool   `json:"includeInactive"`
	MaxResults      int    `json:"maxResults"`
	NextToken       string `json:"nextToken"`
}

type documentIDRequest struct {
	AgentSpaceID string `json:"agentSpaceId"`
	DocumentID   string `json:"documentId"`
}

func decode(w http.ResponseWriter, r *http.Request, dest any) bool {
	if r.Body == nil {
		writeError(w, http.StatusBadRequest, "request body is required")
		return false
	}
	defer r.Body.Close()
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dest); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Warn("write response", "error", err)
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]string{
			"message": message,
			"code":    strconv.Itoa(status),
		},
	})
}

func writeNotFoundOrError(w http.ResponseWriter, err error) {
	if errors.Is(err, os.ErrNotExist) {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	writeError(w, http.StatusInternalServerError, err.Error())
}

func normalizeEnvironment(input model.EnvVars) (model.EnvVars, error) {
	if len(input) == 0 {
		return nil, nil
	}
	output := make(model.EnvVars, len(input))
	for rawKey, value := range input {
		key := strings.TrimSpace(rawKey)
		if key == "" {
			return nil, errors.New("environment variable key is required")
		}
		if len(key) > 128 {
			return nil, fmt.Errorf("environment variable key %q exceeds 128 characters", key)
		}
		if !validEnvKey(key) {
			return nil, fmt.Errorf("invalid environment variable key %q", key)
		}
		if _, exists := output[key]; exists {
			return nil, fmt.Errorf("duplicate environment variable key %q", key)
		}
		if len(value) > 8192 {
			return nil, fmt.Errorf("environment variable %q exceeds 8192 bytes", key)
		}
		output[key] = value
	}
	if len(output) == 0 {
		return nil, nil
	}
	return output, nil
}

func validEnvKey(key string) bool {
	for index, r := range key {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r == '_' {
			continue
		}
		if index > 0 && r >= '0' && r <= '9' {
			continue
		}
		return false
	}
	return true
}

func entity(value any) map[string]any {
	return map[string]any{"entity": value}
}

func applyLimit[T any](values []T, maxResults int) []T {
	if maxResults <= 0 || maxResults >= len(values) {
		return values
	}
	return values[:maxResults]
}
