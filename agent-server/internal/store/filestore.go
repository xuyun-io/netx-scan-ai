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

	defaultConversationTitle = "新的会话"
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

	name := strings.TrimSpace(req.Name)
	if err := validateAgentSpaceName(name); err != nil {
		return model.AgentSpace{}, err
	}
	if _, err := s.getAgentSpaceUnlocked(name); err == nil {
		return model.AgentSpace{}, fmt.Errorf("name %q already exists", name)
	}

	now := time.Now().UTC()
	req.Name = name
	if req.LLM.Provider == "" {
		req.LLM.Provider = "gemini"
	}
	if req.LLM.Model == "" {
		req.LLM.Model = "gemini-2.5-pro"
	}
	req.CreatedAt = now
	req.UpdatedAt = now
	if err := s.ensureAgentDirs(req.Name); err != nil {
		return model.AgentSpace{}, err
	}
	if err := writeYAML(s.agentFile(req.Name), req); err != nil {
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

func (s *Store) GetAgentSpace(_ context.Context, name string) (model.AgentSpace, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.getAgentSpaceUnlocked(name)
}

func (s *Store) getAgentSpaceUnlocked(name string) (model.AgentSpace, error) {
	if name == "" {
		return model.AgentSpace{}, fmt.Errorf("name is required")
	}
	var space model.AgentSpace
	err := readYAML(s.agentFile(name), &space)
	return space, err
}

func (s *Store) UpdateAgentSpace(_ context.Context, req model.AgentSpace) (model.AgentSpace, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	space, err := s.getAgentSpaceUnlocked(req.Name)
	if err != nil {
		return model.AgentSpace{}, err
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
	if err := writeYAML(s.agentFile(space.Name), space); err != nil {
		return model.AgentSpace{}, err
	}
	return space, nil
}

func (s *Store) DeleteAgentSpace(_ context.Context, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return os.RemoveAll(s.agentDir(name))
}

func validateAgentSpaceName(name string) error {
	if name == "" {
		return fmt.Errorf("name is required")
	}
	if len(name) > 64 {
		return fmt.Errorf("name must be at most 64 characters")
	}
	for _, r := range name {
		if (r < 'a' || r > 'z') && (r < 'A' || r > 'Z') && (r < '0' || r > '9') && r != '_' && r != '-' {
			return fmt.Errorf("name must only contain letters, digits, underscores or hyphens")
		}
	}
	return nil
}

func (s *Store) CreateConversation(_ context.Context, agentSpaceName, title string) (model.Conversation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ensureAgentDirs(agentSpaceName); err != nil {
		return model.Conversation{}, err
	}
	now := time.Now().UTC()
	title = strings.TrimSpace(title)
	if title == "" {
		title = defaultConversationTitle
	}
	conv := model.Conversation{
		ID:             agentSpaceNameScopedID(NewConversationID()),
		AgentSpaceName: agentSpaceName,
		Title:          title,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	dir := s.conversationDir(agentSpaceName, conv.ID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return model.Conversation{}, err
	}
	if err := writeYAML(filepath.Join(dir, "conversation.yaml"), conv); err != nil {
		return model.Conversation{}, err
	}
	_ = appendJSONL(s.indexFile(agentSpaceName, "conversations.jsonl"), conv)
	return conv, nil
}

func (s *Store) ListConversations(_ context.Context, agentSpaceName string) ([]model.Conversation, error) {
	dir := filepath.Join(s.agentDir(agentSpaceName), "conversations")
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
		conv, err := s.GetConversation(context.Background(), agentSpaceName, entry.Name())
		if err == nil {
			conversations = append(conversations, conv)
		}
	}
	sort.Slice(conversations, func(i, j int) bool {
		return conversations[i].UpdatedAt.After(conversations[j].UpdatedAt)
	})
	return conversations, nil
}

func (s *Store) GetConversation(_ context.Context, agentSpaceName, id string) (model.Conversation, error) {
	var conv model.Conversation
	err := readYAML(filepath.Join(s.conversationDir(agentSpaceName, id), "conversation.yaml"), &conv)
	return conv, err
}

func (s *Store) DeleteConversation(_ context.Context, agentSpaceName, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return os.RemoveAll(s.conversationDir(agentSpaceName, id))
}

func (s *Store) AppendTurn(_ context.Context, turn model.Turn) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	path := filepath.Join(s.conversationDir(turn.AgentSpaceName, turn.ConversationID), "turns.jsonl")
	existingTurns, err := readJSONL[model.Turn](path)
	if errors.Is(err, os.ErrNotExist) {
		existingTurns = nil
	} else if err != nil {
		return err
	}
	if err := appendJSONL(path, turn); err != nil {
		return err
	}
	conversationPath := filepath.Join(s.conversationDir(turn.AgentSpaceName, turn.ConversationID), "conversation.yaml")
	var conv model.Conversation
	err = readYAML(conversationPath, &conv)
	if err == nil {
		conv.UpdatedAt = time.Now().UTC()
		if len(existingTurns) == 0 && isUntitledConversation(conv.Title) {
			conv.Title = titleFromConversationPrompt(turn.Prompt)
		}
		_ = writeYAML(conversationPath, conv)
	}
	return nil
}

func (s *Store) UpdateTurn(_ context.Context, turn model.Turn) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	path := filepath.Join(s.conversationDir(turn.AgentSpaceName, turn.ConversationID), "turns.jsonl")
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

func (s *Store) GetTurn(_ context.Context, agentSpaceName, conversationID, turnID string) (model.Turn, error) {
	turns, err := s.ListTurns(context.Background(), agentSpaceName, conversationID)
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

func (s *Store) ListTurns(_ context.Context, agentSpaceName, conversationID string) ([]model.Turn, error) {
	path := filepath.Join(s.conversationDir(agentSpaceName, conversationID), "turns.jsonl")
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
	dir := s.taskDir(task.AgentSpaceName, task.ID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return model.Task{}, err
	}
	if err := writeYAML(filepath.Join(dir, "task.yaml"), task); err != nil {
		return model.Task{}, err
	}
	_ = appendJSONL(s.indexFile(task.AgentSpaceName, "tasks.jsonl"), task)
	return task, nil
}

func (s *Store) UpdateTask(_ context.Context, task model.Task) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	task.UpdatedAt = time.Now().UTC()
	if err := writeYAML(filepath.Join(s.taskDir(task.AgentSpaceName, task.ID), "task.yaml"), task); err != nil {
		return err
	}
	_ = appendJSONL(s.indexFile(task.AgentSpaceName, "tasks.jsonl"), task)
	return nil
}

func (s *Store) GetTask(_ context.Context, agentSpaceName, id string) (model.Task, error) {
	var task model.Task
	err := readYAML(filepath.Join(s.taskDir(agentSpaceName, id), "task.yaml"), &task)
	return task, err
}

func (s *Store) ListTasks(_ context.Context, agentSpaceName string) ([]model.Task, error) {
	dir := filepath.Join(s.agentDir(agentSpaceName), "tasks")
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
		task, err := s.GetTask(context.Background(), agentSpaceName, entry.Name())
		if err == nil {
			tasks = append(tasks, task)
		}
	}
	sort.Slice(tasks, func(i, j int) bool {
		return tasks[i].UpdatedAt.After(tasks[j].UpdatedAt)
	})
	return tasks, nil
}

func (s *Store) DeleteTask(_ context.Context, agentSpaceName, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return os.RemoveAll(s.taskDir(agentSpaceName, id))
}

func (s *Store) CreateAutomation(_ context.Context, automation model.Automation) (model.Automation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	if automation.ID == "" {
		automation.ID = NewAutomationID()
	}
	if automation.Name == "" {
		automation.Name = titleFromInstruction(automation.Instruction)
	}
	if automation.TriggerType == "" {
		automation.TriggerType = model.AutomationTriggerSchedule
	}
	if automation.Status == "" {
		if automation.Enabled {
			automation.Status = model.AutomationStatusActive
		} else {
			automation.Status = model.AutomationStatusDisabled
		}
	}
	automation.CreatedAt = now
	automation.UpdatedAt = now
	dir := s.automationDir(automation.AgentSpaceName, automation.ID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return model.Automation{}, err
	}
	if err := writeYAML(filepath.Join(dir, "automation.yaml"), automation); err != nil {
		return model.Automation{}, err
	}
	_ = appendJSONL(s.indexFile(automation.AgentSpaceName, "automations.jsonl"), automation)
	return automation, nil
}

func (s *Store) UpdateAutomation(_ context.Context, automation model.Automation) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	automation.UpdatedAt = time.Now().UTC()
	if err := writeYAML(filepath.Join(s.automationDir(automation.AgentSpaceName, automation.ID), "automation.yaml"), automation); err != nil {
		return err
	}
	_ = appendJSONL(s.indexFile(automation.AgentSpaceName, "automations.jsonl"), automation)
	return nil
}

func (s *Store) GetAutomation(_ context.Context, agentSpaceName, id string) (model.Automation, error) {
	var automation model.Automation
	err := readYAML(filepath.Join(s.automationDir(agentSpaceName, id), "automation.yaml"), &automation)
	return automation, err
}

func (s *Store) DeleteAutomation(_ context.Context, agentSpaceName, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return os.RemoveAll(s.automationDir(agentSpaceName, id))
}

func (s *Store) ListAutomations(_ context.Context, agentSpaceName string) ([]model.Automation, error) {
	dir := filepath.Join(s.agentDir(agentSpaceName), "automations")
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return []model.Automation{}, nil
	}
	if err != nil {
		return nil, err
	}
	automations := []model.Automation{}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		automation, err := s.GetAutomation(context.Background(), agentSpaceName, entry.Name())
		if err == nil {
			automations = append(automations, automation)
		}
	}
	sort.Slice(automations, func(i, j int) bool {
		return automations[i].UpdatedAt.After(automations[j].UpdatedAt)
	})
	return automations, nil
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
	return appendJSONL(filepath.Join(s.taskDir(record.AgentSpaceName, record.TaskID), "records.jsonl"), record)
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
	return appendJSONL(filepath.Join(s.conversationDir(record.AgentSpaceName, record.ConversationID), "records.jsonl"), record)
}

func (s *Store) ListRecords(_ context.Context, agentSpaceName, taskID, conversationID, turnID string) ([]model.Record, error) {
	var path string
	if taskID != "" {
		path = filepath.Join(s.taskDir(agentSpaceName, taskID), "records.jsonl")
	} else if conversationID != "" {
		path = filepath.Join(s.conversationDir(agentSpaceName, conversationID), "records.jsonl")
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
	if artifact.Version <= 0 {
		artifact.Version = 1
	}
	filename := fmt.Sprintf("%s-%s", artifact.ID, SafeName(artifact.Name))
	relPath := filepath.Join("artifacts", filename)
	fullPath := filepath.Join(s.agentDir(artifact.AgentSpaceName), relPath)
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		return model.Artifact{}, err
	}
	if err := os.WriteFile(fullPath, content, 0o644); err != nil {
		return model.Artifact{}, err
	}
	artifact.Path = relPath
	artifact.Size = int64(len(content))
	artifact.CreatedAt = now
	if err := appendJSONL(s.indexFile(artifact.AgentSpaceName, "artifacts.jsonl"), artifact); err != nil {
		return model.Artifact{}, err
	}
	return artifact, nil
}

func (s *Store) ListArtifacts(_ context.Context, agentSpaceName string) ([]model.Artifact, error) {
	artifacts, err := readJSONL[model.Artifact](s.indexFile(agentSpaceName, "artifacts.jsonl"))
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

func (s *Store) GetArtifact(_ context.Context, agentSpaceName, id string) (model.Artifact, []byte, error) {
	artifacts, err := s.ListArtifacts(context.Background(), agentSpaceName)
	if err != nil {
		return model.Artifact{}, nil, err
	}
	for _, artifact := range artifacts {
		if artifact.ID == id {
			content, err := os.ReadFile(filepath.Join(s.agentDir(agentSpaceName), artifact.Path))
			return artifact, content, err
		}
	}
	return model.Artifact{}, nil, os.ErrNotExist
}

func (s *Store) DeleteArtifact(_ context.Context, agentSpaceName, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	artifacts, err := s.ListArtifacts(context.Background(), agentSpaceName)
	if err != nil {
		return err
	}
	var target model.Artifact
	filtered := artifacts[:0]
	for _, a := range artifacts {
		if a.ID == id {
			target = a
			continue
		}
		filtered = append(filtered, a)
	}
	if target.ID == "" {
		return os.ErrNotExist
	}
	if target.Path != "" {
		if err := os.Remove(filepath.Join(s.agentDir(agentSpaceName), target.Path)); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return writeJSONL(s.indexFile(agentSpaceName, "artifacts.jsonl"), filtered)
}

func (s *Store) CreateDocument(_ context.Context, agentSpaceName, name, contentType, contentBase64 string) (model.Document, error) {
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
	total, err := s.activeDocumentSizeLocked(agentSpaceName)
	if err != nil {
		return model.Document{}, err
	}
	if total+int64(len(content)) > MaxDocumentsTotalSize {
		return model.Document{}, fmt.Errorf("documents exceed total quota %d bytes", MaxDocumentsTotalSize)
	}
	now := time.Now().UTC()
	doc := model.Document{
		ID:             agentSpaceNameScopedID(NewDocumentID()),
		AgentSpaceName: agentSpaceName,
		Name:           SafeName(name),
		ContentType:    contentType,
		Size:           int64(len(content)),
		Status:         model.StatusActive,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	fileRel := filepath.Join("documents", fmt.Sprintf("%s-%s", doc.ID, doc.Name))
	filePath := filepath.Join(s.agentDir(agentSpaceName), fileRel)
	if err := os.MkdirAll(filepath.Dir(filePath), 0o755); err != nil {
		return model.Document{}, err
	}
	if err := os.WriteFile(filePath, content, 0o644); err != nil {
		return model.Document{}, err
	}
	doc.Path = fileRel
	if err := os.MkdirAll(filepath.Join(s.agentDir(agentSpaceName), "documents", ".meta"), 0o755); err != nil {
		return model.Document{}, err
	}
	if err := writeYAML(s.documentMetaFile(agentSpaceName, doc.ID), doc); err != nil {
		return model.Document{}, err
	}
	_ = appendJSONL(s.indexFile(agentSpaceName, "documents.jsonl"), doc)
	return doc, nil
}

func (s *Store) ListDocuments(_ context.Context, agentSpaceName string, includeInactive bool) ([]model.Document, error) {
	metaDir := filepath.Join(s.agentDir(agentSpaceName), "documents", ".meta")
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

func (s *Store) GetDocument(_ context.Context, agentSpaceName, id string) (model.Document, error) {
	var doc model.Document
	err := readYAML(s.documentMetaFile(agentSpaceName, id), &doc)
	return doc, err
}

func (s *Store) DeleteDocument(_ context.Context, agentSpaceName, id string) (model.Document, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	doc, err := s.GetDocument(context.Background(), agentSpaceName, id)
	if err != nil {
		return model.Document{}, err
	}
	now := time.Now().UTC()
	doc.Status = model.StatusInactive
	doc.UpdatedAt = now
	doc.DeletedAt = &now
	if err := writeYAML(s.documentMetaFile(agentSpaceName, id), doc); err != nil {
		return model.Document{}, err
	}
	_ = appendJSONL(s.indexFile(agentSpaceName, "documents.jsonl"), doc)
	return doc, nil
}

func (s *Store) ensureAgentDirs(agentSpaceName string) error {
	for _, dir := range []string{
		s.agentDir(agentSpaceName),
		filepath.Join(s.agentDir(agentSpaceName), "conversations"),
		filepath.Join(s.agentDir(agentSpaceName), "tasks"),
		filepath.Join(s.agentDir(agentSpaceName), "automations"),
		filepath.Join(s.agentDir(agentSpaceName), "documents"),
		filepath.Join(s.agentDir(agentSpaceName), "documents", ".meta"),
		filepath.Join(s.agentDir(agentSpaceName), "artifacts"),
		filepath.Join(s.agentDir(agentSpaceName), "memory"),
		filepath.Join(s.agentDir(agentSpaceName), "credentials"),
		filepath.Join(s.agentDir(agentSpaceName), "index"),
		filepath.Join(s.agentDir(agentSpaceName), "logs"),
		filepath.Join(s.agentDir(agentSpaceName), "tmp"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	memories := filepath.Join(s.agentDir(agentSpaceName), "memory", "memories.jsonl")
	if _, err := os.Stat(memories); errors.Is(err, os.ErrNotExist) {
		if err := os.WriteFile(memories, nil, 0o644); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) activeDocumentSizeLocked(agentSpaceName string) (int64, error) {
	docs, err := s.ListDocuments(context.Background(), agentSpaceName, false)
	if err != nil {
		return 0, err
	}
	var total int64
	for _, doc := range docs {
		total += doc.Size
	}
	return total, nil
}

func (s *Store) agentDir(agentSpaceName string) string {
	return filepath.Join(s.root, agentSpaceName)
}

func (s *Store) agentFile(agentSpaceName string) string {
	return filepath.Join(s.agentDir(agentSpaceName), "agent.yaml")
}

func (s *Store) conversationDir(agentSpaceName, conversationID string) string {
	return filepath.Join(s.agentDir(agentSpaceName), "conversations", conversationID)
}

func (s *Store) taskDir(agentSpaceName, taskID string) string {
	return filepath.Join(s.agentDir(agentSpaceName), "tasks", taskID)
}

func (s *Store) automationDir(agentSpaceName, automationID string) string {
	return filepath.Join(s.agentDir(agentSpaceName), "automations", automationID)
}

func (s *Store) documentMetaFile(agentSpaceName, documentID string) string {
	return filepath.Join(s.agentDir(agentSpaceName), "documents", ".meta", documentID+".yaml")
}

func (s *Store) indexFile(agentSpaceName, name string) string {
	return filepath.Join(s.agentDir(agentSpaceName), "index", name)
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
	instruction = strings.Join(strings.Fields(instruction), " ")
	if instruction == "" {
		return "未命名任务"
	}
	runes := []rune(instruction)
	if len(runes) > 96 {
		return string(runes[:96]) + "..."
	}
	return instruction
}

func isUntitledConversation(title string) bool {
	title = strings.TrimSpace(title)
	return title == "" || title == defaultConversationTitle
}

func titleFromConversationPrompt(prompt string) string {
	prompt = strings.Join(strings.Fields(prompt), " ")
	if prompt == "" {
		return defaultConversationTitle
	}
	runes := []rune(prompt)
	if len(runes) > 34 {
		return string(runes[:34]) + "..."
	}
	return prompt
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

func agentSpaceNameScopedID(id string) string {
	return id
}
