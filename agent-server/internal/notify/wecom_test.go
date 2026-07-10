package notify

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/model"
)

func TestWeComNotifyTaskAwaitingApprovalSendsMarkdown(t *testing.T) {
	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s", r.Method)
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		_, _ = w.Write([]byte(`{"errcode":0,"errmsg":"ok"}`))
	}))
	defer server.Close()

	sent, err := (WeComClient{}).NotifyTaskAwaitingApproval(context.Background(), model.AgentSpace{
		Name: "Chain287",
		Integrations: model.Integrations{
			WeCom: model.WeComConfig{Enabled: true, WebhookURL: server.URL},
		},
	}, model.Task{
		ID:          "task-1",
		Name:        "Restart validator",
		Priority:    "high",
		Type:        "ops",
		Instruction: "restart validator service",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !sent {
		t.Fatal("notification was not sent")
	}
	if payload["msgtype"] != "markdown" {
		t.Fatalf("payload = %#v", payload)
	}
	markdown := payload["markdown"].(map[string]any)["content"].(string)
	if !strings.Contains(markdown, "Restart validator") || !strings.Contains(markdown, "task-1") {
		t.Fatalf("markdown = %q", markdown)
	}
}

func TestWeComNotifyTaskAwaitingApprovalDisabled(t *testing.T) {
	sent, err := (WeComClient{}).NotifyTaskAwaitingApproval(context.Background(), model.AgentSpace{}, model.Task{})
	if err != nil {
		t.Fatal(err)
	}
	if sent {
		t.Fatal("disabled integration should not send")
	}
}

func TestWeComSendTextIncludesMentions(t *testing.T) {
	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		_, _ = w.Write([]byte(`{"errcode":0,"errmsg":"ok"}`))
	}))
	defer server.Close()

	err := (WeComClient{}).SendText(context.Background(), server.URL, "hello", TextOptions{
		MentionedList:       []string{"wangqing"},
		MentionedMobileList: []string{"13800001111"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if payload["msgtype"] != "text" {
		t.Fatalf("payload = %#v", payload)
	}
	text := payload["text"].(map[string]any)
	if text["content"] != "hello" {
		t.Fatalf("text payload = %#v", text)
	}
	if got := text["mentioned_list"].([]any)[0]; got != "wangqing" {
		t.Fatalf("mentioned_list = %#v", text["mentioned_list"])
	}
	if got := text["mentioned_mobile_list"].([]any)[0]; got != "13800001111" {
		t.Fatalf("mentioned_mobile_list = %#v", text["mentioned_mobile_list"])
	}
}

func TestWeComNotifyAutomationTaskFinished(t *testing.T) {
	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		_, _ = w.Write([]byte(`{"errcode":0,"errmsg":"ok"}`))
	}))
	defer server.Close()

	startedAt := time.Date(2026, 7, 10, 9, 0, 0, 0, time.UTC)
	completedAt := startedAt.Add(2 * time.Minute)
	sent, err := (WeComClient{PublicURL: "https://netx.example"}).NotifyAutomationTaskFinished(context.Background(), model.AgentSpace{
		Name: "Chain287",
		Integrations: model.Integrations{
			WeCom: model.WeComConfig{Enabled: true, WebhookURL: server.URL},
		},
	}, model.Task{
		ID:           "task-1",
		Name:         "Daily inspection",
		Source:       model.TaskSourceAutomationSchedule,
		AutomationID: "automation-1",
		Status:       model.StatusCompleted,
		Output:       map[string]string{"summary": "巡检完成，未发现异常。"},
		Artifacts:    []string{"artifact-1"},
		StartedAt:    &startedAt,
		CompletedAt:  &completedAt,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !sent {
		t.Fatal("notification was not sent")
	}
	markdown := payload["markdown"].(map[string]any)["content"].(string)
	for _, want := range []string{"Daily inspection", "automation-1", "SUCCESS", "巡检完成", "https://netx.example/Chain287/#/task/task-1"} {
		if !strings.Contains(markdown, want) {
			t.Fatalf("markdown missing %q: %s", want, markdown)
		}
	}
}
