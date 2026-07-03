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
		ID:          space.ID,
		Name:        "updated",
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
	if updated.Name != "updated" {
		t.Fatalf("name = %q, want updated", updated.Name)
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

	loaded, err := s.GetAgentSpace(ctx, space.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Name != "updated" {
		t.Fatalf("loaded name = %q", loaded.Name)
	}
	if loaded.Environment["NEW_KEY"] != "new-value" {
		t.Fatalf("loaded environment NEW_KEY = %q", loaded.Environment["NEW_KEY"])
	}
}

func TestFileStorePersistsAgentTaskAndDocument(t *testing.T) {
	ctx := context.Background()
	s := New(t.TempDir())

	space, err := s.CreateAgentSpace(ctx, model.AgentSpace{
		Name: "test",
		Environment: model.EnvVars{
			"CHAIN287_RPC_URL": "https://rpc.chain287.example",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	loadedSpace, err := s.GetAgentSpace(ctx, space.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loadedSpace.Environment["CHAIN287_RPC_URL"] != "https://rpc.chain287.example" {
		t.Fatalf("environment CHAIN287_RPC_URL = %q", loadedSpace.Environment["CHAIN287_RPC_URL"])
	}

	task, err := s.CreateTask(ctx, model.Task{
		AgentSpaceID: space.ID,
		Instruction:  "生成 validator 巡检报告",
	})
	if err != nil {
		t.Fatal(err)
	}
	if task.ID == "" {
		t.Fatal("task id is empty")
	}

	if err := s.AppendTaskRecord(ctx, model.Record{
		AgentSpaceID: space.ID,
		TaskID:       task.ID,
		Type:         model.RecordStatus,
		Content:      "created",
	}); err != nil {
		t.Fatal(err)
	}
	records, err := s.ListRecords(ctx, space.ID, task.ID, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 1 {
		t.Fatalf("records length = %d, want 1", len(records))
	}

	doc, err := s.CreateDocument(ctx, space.ID, "runbook.md", "text/markdown", base64.StdEncoding.EncodeToString([]byte("# runbook")))
	if err != nil {
		t.Fatal(err)
	}
	if doc.Status != model.StatusActive {
		t.Fatalf("document status = %s", doc.Status)
	}
	deleted, err := s.DeleteDocument(ctx, space.ID, doc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if deleted.Status != model.StatusInactive {
		t.Fatalf("deleted document status = %s", deleted.Status)
	}
}
