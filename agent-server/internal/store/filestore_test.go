package store

import (
	"context"
	"encoding/base64"
	"testing"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/model"
)

func TestUpdateAgentSpace(t *testing.T) {
	ctx := context.Background()
	s := New(t.TempDir())

	space, err := s.CreateAgentSpace(ctx, model.AgentSpace{
		Name: "test",
		Environment: model.EnvVars{
			"OLD_KEY": "old-value",
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	updated, err := s.UpdateAgentSpace(ctx, model.AgentSpace{
		Name:        "test",
		Description: "updated description",
		LLM: model.LLMConfig{
			Provider: "openai",
			Model:    "gpt-4",
		},
		Environment: model.EnvVars{
			"NEW_KEY": "new-value",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Name != "test" {
		t.Fatalf("name = %q, want test", updated.Name)
	}
	if updated.Description != "updated description" {
		t.Fatalf("description = %q", updated.Description)
	}
	if updated.LLM.Provider != "openai" || updated.LLM.Model != "gpt-4" {
		t.Fatalf("llm = %+v", updated.LLM)
	}
	if updated.Environment["NEW_KEY"] != "new-value" {
		t.Fatalf("environment NEW_KEY = %q", updated.Environment["NEW_KEY"])
	}
	if _, exists := updated.Environment["OLD_KEY"]; exists {
		t.Fatal("OLD_KEY should have been replaced")
	}

	loaded, err := s.GetAgentSpace(ctx, space.Name)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Name != "test" {
		t.Fatalf("loaded name = %q, want test", loaded.Name)
	}
	if loaded.Environment["NEW_KEY"] != "new-value" {
		t.Fatalf("loaded environment NEW_KEY = %q", loaded.Environment["NEW_KEY"])
	}
}

func TestFileStorePersistsAgentTaskAndDocument(t *testing.T) {
	ctx := context.Background()
	s := New(t.TempDir())

	space, err := s.CreateAgentSpace(ctx, model.AgentSpace{
		Name: "test2",
		Environment: model.EnvVars{
			"CHAIN287_RPC_URL": "https://rpc.chain287.example",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	loadedSpace, err := s.GetAgentSpace(ctx, space.Name)
	if err != nil {
		t.Fatal(err)
	}
	if loadedSpace.Environment["CHAIN287_RPC_URL"] != "https://rpc.chain287.example" {
		t.Fatalf("environment CHAIN287_RPC_URL = %q", loadedSpace.Environment["CHAIN287_RPC_URL"])
	}

	task, err := s.CreateTask(ctx, model.Task{
		AgentSpaceName: space.Name,
		Instruction:    "生成 validator 巡检报告",
	})
	if err != nil {
		t.Fatal(err)
	}
	if task.ID == "" {
		t.Fatal("task id is empty")
	}

	if err := s.AppendTaskRecord(ctx, model.Record{
		AgentSpaceName: space.Name,
		TaskID:         task.ID,
		Type:           model.RecordStatus,
		Content:        "created",
	}); err != nil {
		t.Fatal(err)
	}
	records, err := s.ListRecords(ctx, space.Name, task.ID, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 1 {
		t.Fatalf("records length = %d, want 1", len(records))
	}

	doc, err := s.CreateDocument(ctx, space.Name, "runbook.md", "text/markdown", base64.StdEncoding.EncodeToString([]byte("# runbook")))
	if err != nil {
		t.Fatal(err)
	}
	if doc.Status != model.StatusActive {
		t.Fatalf("document status = %s", doc.Status)
	}
	deleted, err := s.DeleteDocument(ctx, space.Name, doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if deleted.Status != model.StatusInactive {
		t.Fatalf("deleted document status = %s", deleted.Status)
	}
}

func TestAppendTurnTitlesUntitledConversationFromFirstPrompt(t *testing.T) {
	ctx := context.Background()
	s := New(t.TempDir())

	space, err := s.CreateAgentSpace(ctx, model.AgentSpace{Name: "chat"})
	if err != nil {
		t.Fatal(err)
	}
	conversation, err := s.CreateConversation(ctx, space.Name, "")
	if err != nil {
		t.Fatal(err)
	}
	if conversation.Title != "新的会话" {
		t.Fatalf("initial title = %q", conversation.Title)
	}

	prompt := "请检查 Chain287 最近 120 个块是否有验证者出块异常，并生成摘要"
	if err := s.AppendTurn(ctx, model.Turn{
		ID:             NewTurnID(),
		AgentSpaceName: space.Name,
		ConversationID: conversation.ID,
		Status:         model.StatusInProgress,
		Prompt:         prompt,
	}); err != nil {
		t.Fatal(err)
	}
	loaded, err := s.GetConversation(ctx, space.Name, conversation.ID)
	if err != nil {
		t.Fatal(err)
	}
	wantTitle := titleFromConversationPrompt(prompt)
	if loaded.Title != wantTitle {
		t.Fatalf("title = %q, want %q", loaded.Title, wantTitle)
	}
}

func TestAppendTurnKeepsExistingConversationTitle(t *testing.T) {
	ctx := context.Background()
	s := New(t.TempDir())

	space, err := s.CreateAgentSpace(ctx, model.AgentSpace{Name: "chat2"})
	if err != nil {
		t.Fatal(err)
	}
	conversation, err := s.CreateConversation(ctx, space.Name, "自定义标题")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.AppendTurn(ctx, model.Turn{
		ID:             NewTurnID(),
		AgentSpaceName: space.Name,
		ConversationID: conversation.ID,
		Status:         model.StatusInProgress,
		Prompt:         "这个问题不应该覆盖标题",
	}); err != nil {
		t.Fatal(err)
	}
	loaded, err := s.GetConversation(ctx, space.Name, conversation.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Title != "自定义标题" {
		t.Fatalf("title = %q, want custom title", loaded.Title)
	}
}
