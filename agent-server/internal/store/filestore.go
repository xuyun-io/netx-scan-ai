package store

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/model"
	"gopkg.in/yaml.v3"
)

const (
	MaxMessageChars       = 1000
	MaxDocumentBytes      = 10 * 1024 * 1024
	MaxDocumentsTotalSize = 100 * 1024 * 1024
)

var allowedDocumentExts = map[string]bool{
	".txt": true, ".csv": true, ".json": true, ".md": true,
	".html": true, ".yaml": true, ".yml": true,
}

type Store struct {
	root string
	mu   sync.Mutex
}

func New(root string) *Store {
	if root == "" {
		root = filepath.Join(".", "data", "agents")
	}
	return &Store{root: root}
}

func (s *Store) Root() string {
	return s.root
}

func (s *Store) CreateAgentSpace(_ context.Context, req model.AgentSpace) (model.AgentSpace, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	if req.ID == "" {
		req.ID = NewAgentSpaceID()
	}
	if req.Name == "" {
		req.Name = "NetX Chain287 SRE"
	}
	if req.LLM.Provider == "" {
		req.LLM.Provider = "gemini"
	}
	if req.LLM.Model == "" {
		req.LLM.Model = "gemini-2.5-pro"
	}
	req.CreatedAt = now
	req.UpdatedAt = now
	if err := s.ensureAgentDirs(req.ID); err != nil {
		return model.AgentSpace{}, err
	}
	if err := writeYAML(s.agentFile(req.ID), req); err != nil {
		return model.AgentSpace{}, err
	}
	return req, nil
}

func (s *Store) ListAgentSpaces(_ context.Context) ([]model.AgentSpace, error) {
	entries, err := os.ReadDir(s.root)
	if errors.Is(err, os.ErrNotExist) {
		return []model.AgentSpace{}, nil
	}
	if err != nil {
		return nil, err
	}
	spaces := []model.AgentSpace{}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		space, err := s.GetAgentSpace(context.Background(), entry.Name())
		if err == nil {
			spaces = append(spaces, space)
		}
	}
	sort.Slice(spaces, func(i, j int) bool {
		return spaces[i].CreatedAt.Before(spaces[j].CreatedAt)
	})
	return spaces, nil
}

func (s *Store) GetAgentSpace(_ context.Context, id string) (model.AgentSpace, error) {
	var space model.AgentSpace
	err := readYAML(s.agentFile(id), &space)
	return space, err
}

func (s *Store) UpdateAgentSpace(_ context.Context, req model.AgentSpace) (model.AgentSpace, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	space, err := s.GetAgentSpace(context.Background(), req.ID)
	if err != nil {
		return model.AgentSpace{}, err
	}
	if req.Name != "" {
		space.Name = req.Name
	}
	if req.Description != "" {
		space.Description = req.Description
	}
	if req.LLM.Provider != "" {
		space.LLM.Provider = req.LLM.Provider
	}
	if req.LLM.Model != "" {
		space.LLM.Model = req.LLM.Model
	}
	if req.LLM.APIKey != "" {
		space.LLM.APIKey = req.LLM.APIKey
	}
	space.LLM.BaseURL = req.LLM.BaseURL
	space.Environment = req.Environment
	space.Integrations = req.Integrations
	space.UpdatedAt = time.Now().UTC()
	if err := writeYAML(s.agentFile(space.ID), space); err != nil {
		return model.AgentSpace{}, err
	}
	return space, nil
}

func (s *Store) DeleteAgentSpace(_ context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return os.RemoveAll(s.agentDir(id))
}

func (s *Store) CreateConversation(_ context.Context, agentSpaceID, title string) (model.Conversation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ensureAgentDirs(agentSpaceID); err != nil {
		return model.Conversation{}, err
	}
	now := time.Now().UTC()
	if title == "" {
		title = "新的会话"
	}
	conv := model.Conversation{
		ID:           agentSpaceIDScopedID(NewConversationID()),
		AgentSpaceID: agentSpaceID,
		Title:        title,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	dir := s.conversationDir(agentSpaceID, conv.ID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return model.Conversation{}, err
	}
	if err := writeYAML(filepath.Join(dir, "conversation.yaml"), conv); err != nil {
		return model.Conversation{}, err
	}
	_ = appendJSONL(s.indexFile(agentSpaceID, "conversations.jsonl"), conv)
	return conv, nil
}

func (s *Store) ListConversations(_ context.Context, agentSpaceID string) ([]model.Conversation, error) {
	dir := filepath.Join(s.agentDir(agentSpaceID), "conversations")
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return []model.Conversation{}, nil
	}
	if err != nil {
		return nil, err
	}
	conversations := []model.Conversation{}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		conv, err := s.GetConversation(context.Background(), agentSpaceID, entry.Name())
		if err == nil {
			conversations = append(conversations, conv)
		}
	}
	sort.Slice(conversations, func(i, j int) bool {
		return conversations[i].UpdatedAt.After(conversations[j].UpdatedAt)
	})
	return conversations, nil
}

func (s *Store) GetConversation(_ context.Context, agentSpaceID, id string) (model.Conversation, error) {
	var conv model.Conversation
	err := readYAML(filepath.Join(s.conversationDir(agentSpaceID, id), "conversation.yaml"), &conv)
	return conv, err
}

func (s *Store) DeleteConversation(_ context.Context, agentSpaceID, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return os.RemoveAll(s.conversationDir(agentSpaceID, id))
}

func (s *Store) AppendTurn(_ context.Context, turn model.Turn) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	path := filepath.Join(s.conversationDir(turn.AgentSpaceID, turn.ConversationID), "turns.jsonl")
	if err := appendJSONL(path, turn); err != nil {
		return err
	}
	conv, err := s.GetConversation(context.Background(), turn.AgentSpaceID, turn.ConversationID)
	if err == nil {
		conv.UpdatedAt = time.Now().UTC()
		_ = writeYAML(filepath.Join(s.conversationDir(turn.AgentSpaceID, turn.ConversationID), "conversation.yaml"), conv)
	}
	return nil
}

func (s *Store) UpdateTurn(_ context.Context, turn model.Turn) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	path := filepath.Join(s.conversationDir(turn.AgentSpaceID, turn.ConversationID), "turns.jsonl")
	turns, err := readJSONL[model.Turn](path)
	if err != nil {
		return err
	}
	replaced := false
	for i := range turns {
		if turns[i].ID == turn.ID {
			turns[i] = turn
			replaced = true
			break
		}
	}
	if !replaced {
		turns = append(turns, turn)
	}
	return writeJSONL(path, turns)
}

func (s *Store) GetTurn(_ context.Context, agentSpaceID, conversationID, turnID string) (model.Turn, error) {
	turns, err := s.ListTurns(context.Background(), agentSpaceID, conversationID)
	if err != nil {
		return model.Turn{}, err
	}
	for _, turn := range turns {
		if turn.ID == turnID {
			return turn, nil
		}
	}
	return model.Turn{}, os.ErrNotExist
}

func (s *Store) ListTurns(_ context.Context, agentSpaceID, conversationID string) ([]model.Turn, error) {
	path := filepath.Join(s.conversationDir(agentSpaceID, conversationID), "turns.jsonl")
	turns, err := readJSONL[model.Turn](path)
	if errors.Is(err, os.ErrNotExist) {
		return []model.Turn{}, nil
	}
	return turns, err
}

func (s *Store) CreateTask(_ context.Context, task model.Task) (model.Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	if task.ID == "" {
		task.ID = NewTaskID()
	}
	if task.Name == "" {
		task.Name = titleFromInstruction(task.Instruction)
	}
	if task.Priority == "" {
		task.Priority = "normal"
	}
	if task.Type == "" {
		task.Type = "diagnosis"
	}
	if task.Source == "" {
		task.Source = model.TaskSourceManual
	}
	if task.Status == "" {
		task.Status = model.StatusPending
	}
	task.CreatedAt = now
	task.UpdatedAt = now
	dir := s.taskDir(task.AgentSpaceID, task.ID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return model.Task{}, err
	}
	if err := writeYAML(filepath.Join(dir, "task.yaml"), task); err != nil {
		return model.Task{}, err
	}
	_ = appendJSONL(s.indexFile(task.AgentSpaceID, "tasks.jsonl"), task)
	return task, nil
}

func (s *Store) UpdateTask(_ context.Context, task model.Task) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	task.UpdatedAt = time.Now().UTC()
	if err := writeYAML(filepath.Join(s.taskDir(task.AgentSpaceID, task.ID), "task.yaml"), task); err != nil {
		return err
	}
	_ = appendJSONL(s.indexFile(task.AgentSpaceID, "tasks.jsonl"), task)
	return nil
}

func (s *Store) GetTask(_ context.Context, agentSpaceID, id string) (model.Task, error) {
	var task model.Task
	err := readYAML(filepath.Join(s.taskDir(agentSpaceID, id), "task.yaml"), &task)
	return task, err
}

func (s *Store) ListTasks(_ context.Context, agentSpaceID string) ([]model.Task, error) {
	dir := filepath.Join(s.agentDir(agentSpaceID), "tasks")
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return []model.Task{}, nil
	}
	if err != nil {
		return nil, err
	}
	tasks := []model.Task{}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		task, err := s.GetTask(context.Background(), agentSpaceID, entry.Name())
		if err == nil {
			tasks = append(tasks, task)
		}
	}
	sort.Slice(tasks, func(i, j int) bool {
		return tasks[i].UpdatedAt.After(tasks[j].UpdatedAt)
	})
	return tasks, nil
}

func (s *Store) DeleteTask(_ context.Context, agentSpaceID, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return os.RemoveAll(s.taskDir(agentSpaceID, id))
}

func (s *Store) AppendTaskRecord(_ context.Context, record model.Record) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if record.ID == "" {
		record.ID = NewRecordID()
	}
	if record.CreatedAt.IsZero() {
		record.CreatedAt = time.Now().UTC()
	}
	return appendJSONL(filepath.Join(s.taskDir(record.AgentSpaceID, record.TaskID), "records.jsonl"), record)
}

func (s *Store) AppendConversationRecord(_ context.Context, record model.Record) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if record.ID == "" {
		record.ID = NewRecordID()
	}
	if record.CreatedAt.IsZero() {
		record.CreatedAt = time.Now().UTC()
	}
	return appendJSONL(filepath.Join(s.conversationDir(record.AgentSpaceID, record.ConversationID), "records.jsonl"), record)
}

func (s *Store) ListRecords(_ context.Context, agentSpaceID, taskID, conversationID, turnID string) ([]model.Record, error) {
	var path string
	if taskID != "" {
		path = filepath.Join(s.taskDir(agentSpaceID, taskID), "records.jsonl")
	} else if conversationID != "" {
		path = filepath.Join(s.conversationDir(agentSpaceID, conversationID), "records.jsonl")
	} else {
		return []model.Record{}, nil
	}
	records, err := readJSONL[model.Record](path)
	if errors.Is(err, os.ErrNotExist) {
		return []model.Record{}, nil
	}
	if err != nil {
		return nil, err
	}
	if turnID == "" {
		return records, nil
	}
	filtered := records[:0]
	for _, record := range records {
		if record.TurnID == turnID {
			filtered = append(filtered, record)
		}
	}
	return filtered, nil
}

func (s *Store) CreateArtifact(_ context.Context, artifact model.Artifact, content []byte) (model.Artifact, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	if artifact.ID == "" {
		artifact.ID = NewArtifactID()
	}
	if artifact.Name == "" {
		artifact.Name = "result.md"
	}
	if artifact.Type == "" {
		artifact.Type = artifactType(artifact.Name)
	}
	filename := fmt.Sprintf("%s-%s", artifact.ID, SafeName(artifact.Name))
	relPath := filepath.Join("artifacts", filename)
	fullPath := filepath.Join(s.agentDir(artifact.AgentSpaceID), relPath)
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		return model.Artifact{}, err
	}
	if err := os.WriteFile(fullPath, content, 0o644); err != nil {
		return model.Artifact{}, err
	}
	artifact.Path = relPath
	artifact.Size = int64(len(content))
	artifact.CreatedAt = now
	if err := appendJSONL(s.indexFile(artifact.AgentSpaceID, "artifacts.jsonl"), artifact); err != nil {
		return model.Artifact{}, err
	}
	return artifact, nil
}

func (s *Store) ListArtifacts(_ context.Context, agentSpaceID string) ([]model.Artifact, error) {
	artifacts, err := readJSONL[model.Artifact](s.indexFile(agentSpaceID, "artifacts.jsonl"))
	if errors.Is(err, os.ErrNotExist) {
		return []model.Artifact{}, nil
	}
	if err != nil {
		return nil, err
	}
	sort.Slice(artifacts, func(i, j int) bool {
		return artifacts[i].CreatedAt.After(artifacts[j].CreatedAt)
	})
	return artifacts, nil
}

func (s *Store) GetArtifact(_ context.Context, agentSpaceID, id string) (model.Artifact, []byte, error) {
	artifacts, err := s.ListArtifacts(context.Background(), agentSpaceID)
	if err != nil {
		return model.Artifact{}, nil, err
	}
	for _, artifact := range artifacts {
		if artifact.ID == id {
			content, err := os.ReadFile(filepath.Join(s.agentDir(agentSpaceID), artifact.Path))
			return artifact, content, err
		}
	}
	return model.Artifact{}, nil, os.ErrNotExist
}

func (s *Store) CreateDocument(_ context.Context, agentSpaceID, name, contentType, contentBase64 string) (model.Document, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ext := strings.ToLower(filepath.Ext(name))
	if !allowedDocumentExts[ext] {
		return model.Document{}, fmt.Errorf("unsupported document type %q", ext)
	}
	content, err := base64.StdEncoding.DecodeString(contentBase64)
	if err != nil {
		return model.Document{}, fmt.Errorf("invalid base64 content: %w", err)
	}
	if len(content) > MaxDocumentBytes {
		return model.Document{}, fmt.Errorf("document exceeds %d bytes", MaxDocumentBytes)
	}
	total, err := s.activeDocumentSizeLocked(agentSpaceID)
	if err != nil {
		return model.Document{}, err
	}
	if total+int64(len(content)) > MaxDocumentsTotalSize {
		return model.Document{}, fmt.Errorf("documents exceed total quota %d bytes", MaxDocumentsTotalSize)
	}
	now := time.Now().UTC()
	doc := model.Document{
		ID:           agentSpaceIDScopedID(NewDocumentID()),
		AgentSpaceID: agentSpaceID,
		Name:         SafeName(name),
		ContentType:  contentType,
		Size:         int64(len(content)),
		Status:       model.StatusActive,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	fileRel := filepath.Join("documents", fmt.Sprintf("%s-%s", doc.ID, doc.Name))
	filePath := filepath.Join(s.agentDir(agentSpaceID), fileRel)
	if err := os.MkdirAll(filepath.Dir(filePath), 0o755); err != nil {
		return model.Document{}, err
	}
	if err := os.WriteFile(filePath, content, 0o644); err != nil {
		return model.Document{}, err
	}
	doc.Path = fileRel
	if err := os.MkdirAll(filepath.Join(s.agentDir(agentSpaceID), "documents", ".meta"), 0o755); err != nil {
		return model.Document{}, err
	}
	if err := writeYAML(s.documentMetaFile(agentSpaceID, doc.ID), doc); err != nil {
		return model.Document{}, err
	}
	_ = appendJSONL(s.indexFile(agentSpaceID, "documents.jsonl"), doc)
	return doc, nil
}

func (s *Store) ListDocuments(_ context.Context, agentSpaceID string, includeInactive bool) ([]model.Document, error) {
	metaDir := filepath.Join(s.agentDir(agentSpaceID), "documents", ".meta")
	entries, err := os.ReadDir(metaDir)
	if errors.Is(err, os.ErrNotExist) {
		return []model.Document{}, nil
	}
	if err != nil {
		return nil, err
	}
	docs := []model.Document{}
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".yaml" {
			continue
		}
		var doc model.Document
		if err := readYAML(filepath.Join(metaDir, entry.Name()), &doc); err != nil {
			continue
		}
		if includeInactive || doc.Status != model.StatusInactive {
			docs = append(docs, doc)
		}
	}
	sort.Slice(docs, func(i, j int) bool {
		return docs[i].UpdatedAt.After(docs[j].UpdatedAt)
	})
	return docs, nil
}

func (s *Store) GetDocument(_ context.Context, agentSpaceID, id string) (model.Document, error) {
	var doc model.Document
	err := readYAML(s.documentMetaFile(agentSpaceID, id), &doc)
	return doc, err
}

func (s *Store) DeleteDocument(_ context.Context, agentSpaceID, id string) (model.Document, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	doc, err := s.GetDocument(context.Background(), agentSpaceID, id)
	if err != nil {
		return model.Document{}, err
	}
	now := time.Now().UTC()
	doc.Status = model.StatusInactive
	doc.UpdatedAt = now
	doc.DeletedAt = &now
	if err := writeYAML(s.documentMetaFile(agentSpaceID, id), doc); err != nil {
		return model.Document{}, err
	}
	_ = appendJSONL(s.indexFile(agentSpaceID, "documents.jsonl"), doc)
	return doc, nil
}

func (s *Store) ensureAgentDirs(agentSpaceID string) error {
	for _, dir := range []string{
		s.agentDir(agentSpaceID),
		filepath.Join(s.agentDir(agentSpaceID), "conversations"),
		filepath.Join(s.agentDir(agentSpaceID), "tasks"),
		filepath.Join(s.agentDir(agentSpaceID), "documents"),
		filepath.Join(s.agentDir(agentSpaceID), "documents", ".meta"),
		filepath.Join(s.agentDir(agentSpaceID), "artifacts"),
		filepath.Join(s.agentDir(agentSpaceID), "memory"),
		filepath.Join(s.agentDir(agentSpaceID), "credentials"),
		filepath.Join(s.agentDir(agentSpaceID), "index"),
		filepath.Join(s.agentDir(agentSpaceID), "logs"),
		filepath.Join(s.agentDir(agentSpaceID), "tmp"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	memories := filepath.Join(s.agentDir(agentSpaceID), "memory", "memories.jsonl")
	if _, err := os.Stat(memories); errors.Is(err, os.ErrNotExist) {
		if err := os.WriteFile(memories, nil, 0o644); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) activeDocumentSizeLocked(agentSpaceID string) (int64, error) {
	docs, err := s.ListDocuments(context.Background(), agentSpaceID, false)
	if err != nil {
		return 0, err
	}
	var total int64
	for _, doc := range docs {
		total += doc.Size
	}
	return total, nil
}

func (s *Store) agentDir(agentSpaceID string) string {
	return filepath.Join(s.root, agentSpaceID)
}

func (s *Store) agentFile(agentSpaceID string) string {
	return filepath.Join(s.agentDir(agentSpaceID), "agent.yaml")
}

func (s *Store) conversationDir(agentSpaceID, conversationID string) string {
	return filepath.Join(s.agentDir(agentSpaceID), "conversations", conversationID)
}

func (s *Store) taskDir(agentSpaceID, taskID string) string {
	return filepath.Join(s.agentDir(agentSpaceID), "tasks", taskID)
}

func (s *Store) documentMetaFile(agentSpaceID, documentID string) string {
	return filepath.Join(s.agentDir(agentSpaceID), "documents", ".meta", documentID+".yaml")
}

func (s *Store) indexFile(agentSpaceID, name string) string {
	return filepath.Join(s.agentDir(agentSpaceID), "index", name)
}

func writeYAML(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := yaml.Marshal(value)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func readYAML(path string, value any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return yaml.Unmarshal(data, value)
}

func appendJSONL(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer file.Close()
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if _, err := file.Write(append(data, '\n')); err != nil {
		return err
	}
	return nil
}

func writeJSONL[T any](path string, values []T) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer file.Close()
	for _, value := range values {
		data, err := json.Marshal(value)
		if err != nil {
			return err
		}
		if _, err := file.Write(append(data, '\n')); err != nil {
			return err
		}
	}
	return nil
}

func readJSONL[T any](path string) ([]T, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	reader := bufio.NewReader(file)
	values := []T{}
	for {
		line, err := reader.ReadBytes('\n')
		if len(strings.TrimSpace(string(line))) > 0 {
			var value T
			if jsonErr := json.Unmarshal(line, &value); jsonErr != nil {
				return nil, jsonErr
			}
			values = append(values, value)
		}
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, err
		}
	}
	return values, nil
}

func titleFromInstruction(instruction string) string {
	instruction = strings.TrimSpace(instruction)
	if instruction == "" {
		return "未命名任务"
	}
	runes := []rune(instruction)
	if len(runes) > 36 {
		return string(runes[:36]) + "..."
	}
	return instruction
}

func artifactType(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".md":
		return "Markdown"
	case ".html":
		return "HTML"
	case ".json":
		return "JSON"
	case ".csv":
		return "CSV"
	default:
		return "Text"
	}
}

func agentSpaceIDScopedID(id string) string {
	return id
}
