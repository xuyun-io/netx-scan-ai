package api

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/agent"
	automationsvc "gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/automation"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/config"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/localtrace"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/model"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/store"
	"go.uber.org/zap"
)

type Server struct {
	store      *store.Store
	agent      *agent.Service
	automation *automationsvc.Service
	webDist    string
	enableCORS bool
	cfg        *config.Config
}

func New(store *store.Store, agentService *agent.Service, webDist string, automationServices ...*automationsvc.Service) *Server {
	return NewWithConfig(store, agentService, webDist, nil, automationServices...)
}

func NewWithConfig(store *store.Store, agentService *agent.Service, webDist string, cfg *config.Config, automationServices ...*automationsvc.Service) *Server {
	var automationService *automationsvc.Service
	if len(automationServices) > 0 {
		automationService = automationServices[0]
	}
	if automationService == nil {
		automationService = automationsvc.NewService(store, agentService)
	}
	if cfg == nil {
		cfg = &config.Config{}
	}
	return &Server{
		store:      store,
		agent:      agentService,
		automation: automationService,
		webDist:    webDist,
		enableCORS: true,
		cfg:        cfg,
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	for path, handler := range map[string]http.HandlerFunc{
		"/api/v1/createAgentSpace":     s.createAgentSpace,
		"/api/v1/listAgentSpaces":      s.listAgentSpaces,
		"/api/v1/getAgentSpace":        s.getAgentSpace,
		"/api/v1/updateAgentSpace":     s.updateAgentSpace,
		"/api/v1/deleteAgentSpace":     s.deleteAgentSpace,
		"/api/v1/createConversation":   s.createConversation,
		"/api/v1/listConversations":    s.listConversations,
		"/api/v1/getConversation":      s.getConversation,
		"/api/v1/deleteConversation":   s.deleteConversation,
		"/api/v1/createTurn":           s.createTurn,
		"/api/v1/getTurn":              s.getTurn,
		"/api/v1/createTask":           s.createTask,
		"/api/v1/getTask":              s.getTask,
		"/api/v1/listTasks":            s.listTasks,
		"/api/v1/deleteTask":           s.deleteTask,
		"/api/v1/respondToTask":        s.respondToTask,
		"/api/v1/cancelTask":           s.cancelTask,
		"/api/v1/createAutomation":     s.createAutomation,
		"/api/v1/listAutomations":      s.listAutomations,
		"/api/v1/getAutomation":        s.getAutomation,
		"/api/v1/updateAutomation":     s.updateAutomation,
		"/api/v1/deleteAutomation":     s.deleteAutomation,
		"/api/v1/triggerAutomation":    s.triggerAutomation,
		"/api/v1/listRecords":          s.listRecords,
		"/api/v1/getLocalToolTrace":    s.getLocalToolTrace,
		"/api/v1/findInvocationTraces": s.findInvocationTraces,
		"/api/v1/listArtifacts":        s.listArtifacts,
		"/api/v1/getArtifact":          s.getArtifact,
		"/api/v1/deleteArtifact":       s.deleteArtifact,
		"/api/v1/createDocument":       s.createDocument,
		"/api/v1/listDocuments":        s.listDocuments,
		"/api/v1/getDocument":          s.getDocument,
		"/api/v1/deleteDocument":       s.deleteDocument,
		"/api/v1/healthz":              s.healthz,
		"/api/v1/login":                s.login,
	} {
		mux.Handle(path, s.postOnly(handler))
	}
	mux.Handle("/", s.staticHandler())
	return s.withMiddleware(mux)
}

func (s *Server) withMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		requestID := requestIDFromHeader(r)
		lrw := &loggingResponseWriter{ResponseWriter: w, status: http.StatusOK}
		w = lrw
		w.Header().Set("X-Request-Id", requestID)
		if s.enableCORS {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Headers", "content-type, authorization")
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			logHTTPRequest(r, requestID, start, lrw)
			return
		}
		if s.cfg.AuthEnabled() && strings.HasPrefix(r.URL.Path, "/api/v1/") && r.URL.Path != "/api/v1/login" {
			if !s.authenticate(r) {
				writeError(w, http.StatusUnauthorized, "unauthorized")
				logHTTPRequest(r, requestID, start, lrw)
				return
			}
		}
		next.ServeHTTP(w, r)
		logHTTPRequest(r, requestID, start, lrw)
	})
}

func (s *Server) authenticate(r *http.Request) bool {
	header := r.Header.Get("Authorization")
	const prefix = "Basic "
	if !strings.HasPrefix(header, prefix) {
		return false
	}
	decoded, err := base64.StdEncoding.DecodeString(header[len(prefix):])
	if err != nil {
		return false
	}
	parts := strings.SplitN(string(decoded), ":", 2)
	if len(parts) != 2 {
		return false
	}
	return s.cfg.ValidateCredentials(parts[0], parts[1])
}

type loggingResponseWriter struct {
	http.ResponseWriter
	status      int
	bytes       int
	wroteHeader bool
}

func (w *loggingResponseWriter) WriteHeader(status int) {
	if w.wroteHeader {
		return
	}
	w.wroteHeader = true
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *loggingResponseWriter) Write(data []byte) (int, error) {
	n, err := w.ResponseWriter.Write(data)
	w.bytes += n
	return n, err
}

func logHTTPRequest(r *http.Request, requestID string, start time.Time, lrw *loggingResponseWriter) {
	fields := []zap.Field{
		zap.String("request_id", requestID),
		zap.String("method", r.Method),
		zap.String("path", r.URL.Path),
		zap.Int("status", lrw.status),
		zap.Int("bytes", lrw.bytes),
		zap.Duration("duration", time.Since(start)),
		zap.String("remote_addr", r.RemoteAddr),
		zap.String("user_agent", r.UserAgent()),
	}
	if lrw.status >= http.StatusInternalServerError {
		zap.L().Error("http request completed", fields...)
		return
	}
	if lrw.status >= http.StatusBadRequest {
		zap.L().Warn("http request completed", fields...)
		return
	}
	if r.URL.Path == "/api/v1/healthz" {
		zap.L().Debug("http request completed", fields...)
		return
	}
	zap.L().Info("http request completed", fields...)
}

func requestIDFromHeader(r *http.Request) string {
	for _, header := range []string{"X-Request-Id", "X-Correlation-Id"} {
		if value := strings.TrimSpace(r.Header.Get(header)); value != "" {
			return value
		}
	}
	var b [8]byte
	if _, err := rand.Read(b[:]); err == nil {
		return hex.EncodeToString(b[:])
	}
	return strconv.FormatInt(time.Now().UnixNano(), 36)
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

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.AuthEnabled() {
		writeJSON(w, http.StatusOK, map[string]any{"authenticated": true, "authEnabled": false})
		return
	}
	if !s.authenticate(r) {
		writeError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"authenticated": true, "authEnabled": true})
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
	var req agentSpaceNameRequest
	if !decode(w, r, &req) {
		return
	}
	space, err := s.store.GetAgentSpace(r.Context(), req.AgentSpaceName)
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
	var req agentSpaceNameRequest
	if !decode(w, r, &req) {
		return
	}
	if err := s.store.DeleteAgentSpace(r.Context(), req.AgentSpaceName); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, entity(map[string]string{"agentSpaceName": req.AgentSpaceName}))
}

func (s *Server) createConversation(w http.ResponseWriter, r *http.Request) {
	var req createConversationRequest
	if !decode(w, r, &req) {
		return
	}
	conv, err := s.store.CreateConversation(r.Context(), req.AgentSpaceName, req.Title)
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
	conversations, err := s.store.ListConversations(r.Context(), req.AgentSpaceName)
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
	conv, err := s.store.GetConversation(r.Context(), req.AgentSpaceName, req.ConversationID)
	if err != nil {
		writeNotFoundOrError(w, err)
		return
	}
	turns, _ := s.store.ListTurns(r.Context(), req.AgentSpaceName, req.ConversationID)
	writeJSON(w, http.StatusOK, map[string]any{"entity": conv, "turns": turns})
}

func (s *Server) deleteConversation(w http.ResponseWriter, r *http.Request) {
	var req conversationIDRequest
	if !decode(w, r, &req) {
		return
	}
	if err := s.store.DeleteConversation(r.Context(), req.AgentSpaceName, req.ConversationID); err != nil {
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
	turn, err := s.agent.CreateTurn(r.Context(), req.AgentSpaceName, req.ConversationID, req.Prompt)
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
	turn, err := s.store.GetTurn(r.Context(), req.AgentSpaceName, req.ConversationID, req.TurnID)
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
		AgentSpaceName:   req.AgentSpaceName,
		Name:             req.Name,
		Description:      req.Description,
		Priority:         req.Priority,
		Type:             req.Type,
		Source:           req.Source,
		AutomationID:     req.AutomationID,
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
	task, err := s.store.GetTask(r.Context(), req.AgentSpaceName, req.TaskID)
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
	tasks, err := s.store.ListTasks(r.Context(), req.AgentSpaceName)
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
	if err := s.store.DeleteTask(r.Context(), req.AgentSpaceName, req.TaskID); err != nil {
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
	task, err := s.agent.RespondToTask(r.Context(), req.AgentSpaceName, req.TaskID, req.Response, req.UserID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, entity(task))
}

func (s *Server) cancelTask(w http.ResponseWriter, r *http.Request) {
	var req taskIDRequest
	if !decode(w, r, &req) {
		return
	}
	task, err := s.agent.CancelTask(r.Context(), req.AgentSpaceName, req.TaskID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, entity(task))
}

func (s *Server) createAutomation(w http.ResponseWriter, r *http.Request) {
	var req createAutomationRequest
	if !decode(w, r, &req) {
		return
	}
	automation, err := s.automation.CreateAutomation(r.Context(), model.Automation{
		AgentSpaceName: req.AgentSpaceName,
		Name:           req.Name,
		Description:    req.Description,
		Instruction:    req.Instruction,
		TriggerType:    model.AutomationTriggerSchedule,
		Enabled:        true,
		Schedule:       req.Schedule,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, entity(automation))
}

func (s *Server) listAutomations(w http.ResponseWriter, r *http.Request) {
	var req listByAgentRequest
	if !decode(w, r, &req) {
		return
	}
	automations, err := s.automation.ListAutomations(r.Context(), req.AgentSpaceName)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, model.Page[model.Automation]{Entities: applyLimit(automations, req.MaxResults)})
}

func (s *Server) getAutomation(w http.ResponseWriter, r *http.Request) {
	var req automationIDRequest
	if !decode(w, r, &req) {
		return
	}
	automation, err := s.automation.GetAutomation(r.Context(), req.AgentSpaceName, req.AutomationID)
	if err != nil {
		writeNotFoundOrError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, entity(automation))
}

func (s *Server) updateAutomation(w http.ResponseWriter, r *http.Request) {
	var req updateAutomationRequest
	if !decode(w, r, &req) {
		return
	}
	var automation model.Automation
	var err error
	if req.Enabled != nil {
		automation, err = s.automation.SetEnabled(r.Context(), req.AgentSpaceName, req.AutomationID, *req.Enabled)
	} else {
		automation, err = s.automation.UpdateAutomation(r.Context(), req.AgentSpaceName, req.AutomationID, req.Name, req.Description, req.Instruction, req.Schedule)
	}
	if err != nil {
		writeNotFoundOrError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, entity(automation))
}

func (s *Server) deleteAutomation(w http.ResponseWriter, r *http.Request) {
	var req automationIDRequest
	if !decode(w, r, &req) {
		return
	}
	if err := s.automation.DeleteAutomation(r.Context(), req.AgentSpaceName, req.AutomationID); err != nil {
		writeNotFoundOrError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func (s *Server) triggerAutomation(w http.ResponseWriter, r *http.Request) {
	var req automationIDRequest
	if !decode(w, r, &req) {
		return
	}
	task, err := s.automation.RunOnce(r.Context(), req.AgentSpaceName, req.AutomationID)
	if err != nil {
		writeNotFoundOrError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, entity(task))
}

func (s *Server) listRecords(w http.ResponseWriter, r *http.Request) {
	var req listRecordsRequest
	if !decode(w, r, &req) {
		return
	}
	records, err := s.store.ListRecords(r.Context(), req.AgentSpaceName, req.TaskID, req.ConversationID, req.TurnID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"records":   applyLimit(records, req.MaxResults),
		"nextToken": nil,
	})
}

func (s *Server) getLocalToolTrace(w http.ResponseWriter, r *http.Request) {
	var req localToolTraceRequest
	if !decode(w, r, &req) {
		return
	}
	record, err := s.agent.GetLocalToolTrace(r.Context(), req.AgentSpaceName, req.Ref)
	if err != nil {
		writeNotFoundOrError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"trace": record})
}

func (s *Server) findInvocationTraces(w http.ResponseWriter, r *http.Request) {
	var req invocationTraceRequest
	if !decode(w, r, &req) {
		return
	}
	traces, err := s.agent.FindInvocationTraces(r.Context(), localtrace.Scope{
		AgentSpaceName: req.AgentSpaceName,
		TaskID:         req.TaskID, ConversationID: req.ConversationID, TurnID: req.TurnID,
	})
	if err != nil {
		writeNotFoundOrError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"traces": traces})
}

func (s *Server) listArtifacts(w http.ResponseWriter, r *http.Request) {
	var req listByAgentRequest
	if !decode(w, r, &req) {
		return
	}
	artifacts, err := s.store.ListArtifacts(r.Context(), req.AgentSpaceName)
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
	artifact, content, err := s.store.GetArtifact(r.Context(), req.AgentSpaceName, req.ArtifactID)
	if err != nil {
		writeNotFoundOrError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"entity":  artifact,
		"content": string(content),
	})
}

func (s *Server) deleteArtifact(w http.ResponseWriter, r *http.Request) {
	var req artifactIDRequest
	if !decode(w, r, &req) {
		return
	}
	if err := s.store.DeleteArtifact(r.Context(), req.AgentSpaceName, req.ArtifactID); err != nil {
		writeNotFoundOrError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, entity(map[string]string{"artifactId": req.ArtifactID}))
}

func (s *Server) createDocument(w http.ResponseWriter, r *http.Request) {
	var req createDocumentRequest
	if !decode(w, r, &req) {
		return
	}
	doc, err := s.store.CreateDocument(r.Context(), req.AgentSpaceName, req.Name, req.ContentType, req.ContentBase64)
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
	docs, err := s.store.ListDocuments(r.Context(), req.AgentSpaceName, req.IncludeInactive)
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
	doc, err := s.store.GetDocument(r.Context(), req.AgentSpaceName, req.DocumentID)
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
	doc, err := s.store.DeleteDocument(r.Context(), req.AgentSpaceName, req.DocumentID)
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
	Name         string             `json:"name"`
	Description  string             `json:"description"`
	LLM          model.LLMConfig    `json:"llm"`
	Environment  model.EnvVars      `json:"environment"`
	Integrations model.Integrations `json:"integrations"`
	ClientToken  string             `json:"clientToken"`
}

type agentSpaceNameRequest struct {
	AgentSpaceName string `json:"agentSpaceName"`
}

type listByAgentRequest struct {
	AgentSpaceName string `json:"agentSpaceName"`
	MaxResults     int    `json:"maxResults"`
	NextToken      string `json:"nextToken"`
}

type createConversationRequest struct {
	AgentSpaceName string `json:"agentSpaceName"`
	Title          string `json:"title"`
	ClientToken    string `json:"clientToken"`
}

type conversationIDRequest struct {
	AgentSpaceName string `json:"agentSpaceName"`
	ConversationID string `json:"conversationId"`
}

type createTurnRequest struct {
	AgentSpaceName string `json:"agentSpaceName"`
	ConversationID string `json:"conversationId"`
	Prompt         string `json:"prompt"`
	ClientToken    string `json:"clientToken"`
}

type turnIDRequest struct {
	AgentSpaceName string `json:"agentSpaceName"`
	ConversationID string `json:"conversationId"`
	TurnID         string `json:"turnId"`
}

type createTaskRequest struct {
	AgentSpaceName   string            `json:"agentSpaceName"`
	Name             string            `json:"name"`
	Description      string            `json:"description"`
	Priority         string            `json:"priority"`
	Type             string            `json:"type"`
	Source           string            `json:"source"`
	AutomationID     string            `json:"automationId"`
	Instruction      string            `json:"instruction"`
	Input            map[string]string `json:"input"`
	RequiresApproval bool              `json:"requiresApproval"`
	PreAuthorized    bool              `json:"preAuthorized"`
	ClientToken      string            `json:"clientToken"`
}

type createAutomationRequest struct {
	AgentSpaceName string                   `json:"agentSpaceName"`
	Name           string                   `json:"name"`
	Description    string                   `json:"description"`
	Instruction    string                   `json:"instruction"`
	Schedule       model.AutomationSchedule `json:"schedule"`
	ClientToken    string                   `json:"clientToken"`
}

type automationIDRequest struct {
	AgentSpaceName string `json:"agentSpaceName"`
	AutomationID   string `json:"automationId"`
}

type updateAutomationRequest struct {
	AgentSpaceName string                   `json:"agentSpaceName"`
	AutomationID   string                   `json:"automationId"`
	Enabled        *bool                    `json:"enabled"`
	Name           string                   `json:"name"`
	Description    string                   `json:"description"`
	Instruction    string                   `json:"instruction"`
	Schedule       model.AutomationSchedule `json:"schedule"`
	ClientToken    string                   `json:"clientToken"`
}
type taskIDRequest struct {
	AgentSpaceName string `json:"agentSpaceName"`
	TaskID         string `json:"taskId"`
}

type respondToTaskRequest struct {
	AgentSpaceName string `json:"agentSpaceName"`
	TaskID         string `json:"taskId"`
	Response       string `json:"response"`
	UserID         string `json:"userId"`
}

type listRecordsRequest struct {
	AgentSpaceName string `json:"agentSpaceName"`
	TaskID         string `json:"taskId"`
	ConversationID string `json:"conversationId"`
	TurnID         string `json:"turnId"`
	MaxResults     int    `json:"maxResults"`
	NextToken      string `json:"nextToken"`
}

type localToolTraceRequest struct {
	AgentSpaceName string `json:"agentSpaceName"`
	Ref            string `json:"ref"`
}

type invocationTraceRequest struct {
	AgentSpaceName string `json:"agentSpaceName"`
	TaskID         string `json:"taskId"`
	ConversationID string `json:"conversationId"`
	TurnID         string `json:"turnId"`
}

type artifactIDRequest struct {
	AgentSpaceName string `json:"agentSpaceName"`
	ArtifactID     string `json:"artifactId"`
}

type createDocumentRequest struct {
	AgentSpaceName string `json:"agentSpaceName"`
	Name           string `json:"name"`
	ContentType    string `json:"contentType"`
	ContentBase64  string `json:"contentBase64"`
	ClientToken    string `json:"clientToken"`
}

type listDocumentsRequest struct {
	AgentSpaceName  string `json:"agentSpaceName"`
	IncludeInactive bool   `json:"includeInactive"`
	MaxResults      int    `json:"maxResults"`
	NextToken       string `json:"nextToken"`
}

type documentIDRequest struct {
	AgentSpaceName string `json:"agentSpaceName"`
	DocumentID     string `json:"documentId"`
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
		zap.L().Warn("write response failed", zap.Error(err))
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
	switch v := value.(type) {
	case model.AgentSpace:
		return map[string]any{"entity": maskAgentSpace(v)}
	case []model.AgentSpace:
		return map[string]any{"entity": maskAgentSpaces(v)}
	case model.Page[model.AgentSpace]:
		v.Entities = maskAgentSpaces(v.Entities)
		return map[string]any{"entity": v}
	}
	return map[string]any{"entity": value}
}

func maskAgentSpace(space model.AgentSpace) model.AgentSpace {
	space.LLM.APIKey = maskAPIKey(space.LLM.APIKey)
	return space
}

func maskAgentSpaces(spaces []model.AgentSpace) []model.AgentSpace {
	result := make([]model.AgentSpace, len(spaces))
	for i, space := range spaces {
		result[i] = maskAgentSpace(space)
	}
	return result
}

func maskAPIKey(key string) string {
	key = strings.TrimSpace(key)
	if key == "" {
		return ""
	}
	return "********"
}

func applyLimit[T any](values []T, maxResults int) []T {
	if maxResults <= 0 || maxResults >= len(values) {
		return values
	}
	return values[:maxResults]
}
