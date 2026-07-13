package localtrace

import (
	"context"
	"testing"
	"time"
)

func TestFileRepositoryRoundTrip(t *testing.T) {
	repo := NewFileRepository(t.TempDir())
	record := ToolRecord{
		Version:        "1.0",
		Scope:          Scope{AgentSpaceName: "chain287", TaskID: "task-1"},
		InvocationID:   "inv/1",
		FunctionCallID: "call/1",
		ToolName:       "execute_skill_action",
		Request:        map[string]any{"action": "rpc_snapshot"},
		Response:       map[string]any{"stdout": "full raw output"},
		CreatedAt:      time.Now().UTC(),
	}
	ref, err := repo.SaveToolRecord(context.Background(), record)
	if err != nil {
		t.Fatal(err)
	}
	if ref.Ref == "" {
		t.Fatal("empty trace reference")
	}
	got, err := repo.GetToolRecord(context.Background(), "chain287", ref.Ref)
	if err != nil {
		t.Fatal(err)
	}
	if got.FunctionCallID != record.FunctionCallID || got.Response["stdout"] != "full raw output" {
		t.Fatalf("record = %+v", got)
	}
}

func TestFileRepositoryRejectsEscapingReference(t *testing.T) {
	repo := NewFileRepository(t.TempDir())
	if _, err := repo.GetToolRecord(context.Background(), "chain287", "../../secret.json"); err == nil {
		t.Fatal("expected escaping reference to be rejected")
	}
}

func TestFileRepositoryFindsInvocationByTaskAndTurn(t *testing.T) {
	repo := NewFileRepository(t.TempDir())
	now := time.Now().UTC()
	for _, summary := range []InvocationSummary{
		{Version: "1.0", InvocationID: "inv-task", Scope: Scope{AgentSpaceName: "chain287", TaskID: "task-1"}, Status: "success", StartedAt: now},
		{Version: "1.0", InvocationID: "inv-chat", Scope: Scope{AgentSpaceName: "chain287", ConversationID: "conv-1", TurnID: "turn-1"}, Status: "success", StartedAt: now},
	} {
		if err := repo.SaveInvocationSummary(context.Background(), summary); err != nil {
			t.Fatal(err)
		}
	}
	taskTraces, err := repo.FindInvocationTraces(context.Background(), Scope{AgentSpaceName: "chain287", TaskID: "task-1"})
	if err != nil || len(taskTraces) != 1 || taskTraces[0].Summary.InvocationID != "inv-task" {
		t.Fatalf("task traces = %+v, err=%v", taskTraces, err)
	}
	chatTraces, err := repo.FindInvocationTraces(context.Background(), Scope{AgentSpaceName: "chain287", ConversationID: "conv-1", TurnID: "turn-1"})
	if err != nil || len(chatTraces) != 1 || chatTraces[0].Summary.InvocationID != "inv-chat" {
		t.Fatalf("chat traces = %+v, err=%v", chatTraces, err)
	}
	if taskTraces[0].Tools == nil {
		t.Fatal("tools must be an empty array, not nil")
	}
	if taskTraces[0].Summary.ModelCalls == nil {
		t.Fatal("model calls must be an empty array, not nil")
	}
}

func TestFileRepositoryBackfillsLegacyModelSpan(t *testing.T) {
	repo := NewFileRepository(t.TempDir())
	startedAt := time.Now().UTC().Add(-time.Second)
	completedAt := startedAt.Add(750 * time.Millisecond)
	summary := InvocationSummary{
		Version: "1.0", InvocationID: "legacy-model", Scope: Scope{AgentSpaceName: "chain287", TaskID: "task-legacy"},
		Status: "success", StartedAt: startedAt, ModelCalls: []ModelCall{{Sequence: 1, Timestamp: completedAt, OutputTokens: 11, ReasoningTokens: 7}},
	}
	if err := repo.SaveInvocationSummary(context.Background(), summary); err != nil {
		t.Fatal(err)
	}
	trace, err := repo.GetInvocationTrace(context.Background(), "chain287", "legacy-model")
	if err != nil {
		t.Fatal(err)
	}
	call := trace.Summary.ModelCalls[0]
	if call.StartedAt.IsZero() || call.CompletedAt.IsZero() || call.DurationMillis != 750 {
		t.Fatalf("model span = %+v", call)
	}
	if call.TotalOutputTokens != 18 || trace.Summary.TotalOutputTokens != 18 {
		t.Fatalf("output totals = call:%d summary:%d", call.TotalOutputTokens, trace.Summary.TotalOutputTokens)
	}
}
