package agent

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/model"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/notify"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/store"
	adkmodel "google.golang.org/adk/v2/model"
)

type automationNotifierFunc func(context.Context, model.AgentSpace, model.Task) (bool, error)

func (f automationNotifierFunc) NotifyAutomationTaskFinished(ctx context.Context, space model.AgentSpace, task model.Task) (bool, error) {
	return f(ctx, space, task)
}

func TestNewWeComToolsOnlyWhenEnabled(t *testing.T) {
	disabledTools, err := newWeComTools(model.AgentSpace{}, notify.WeComClient{})
	if err != nil {
		t.Fatal(err)
	}
	if len(disabledTools) != 0 {
		t.Fatalf("disabled tools = %+v", disabledTools)
	}

	enabledTools, err := newWeComTools(model.AgentSpace{
		Integrations: model.Integrations{
			WeCom: model.WeComConfig{Enabled: true, WebhookURL: "https://example.invalid/webhook"},
		},
	}, notify.WeComClient{})
	if err != nil {
		t.Fatal(err)
	}
	if len(enabledTools) != 1 || enabledTools[0].Name() != SendWeComMessageToolName {
		t.Fatalf("enabled tools = %+v", enabledTools)
	}
}

func TestSendWeComMessageUsesConfiguredWebhook(t *testing.T) {
	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		_, _ = w.Write([]byte(`{"errcode":0,"errmsg":"ok"}`))
	}))
	defer server.Close()

	output, err := sendWeComMessage(context.Background(), notify.WeComClient{}, model.WeComConfig{
		Enabled:    true,
		WebhookURL: server.URL,
	}, sendWeComMessageInput{
		Title:       "巡检结果",
		Content:     "未发现异常。",
		MessageType: "markdown",
		Severity:    "success",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !output.Sent || output.MessageType != "markdown" || output.Severity != "success" {
		t.Fatalf("output = %+v", output)
	}
	markdown := payload["markdown"].(map[string]any)["content"].(string)
	if !strings.Contains(markdown, "巡检结果") || !strings.Contains(markdown, "未发现异常") {
		t.Fatalf("markdown = %q", markdown)
	}
}

func TestAutomationNotificationFailureDoesNotFailTask(t *testing.T) {
	ctx := context.Background()
	fileStore := store.New(t.TempDir())
	space, err := fileStore.CreateAgentSpace(ctx, model.AgentSpace{Name: "test"})
	if err != nil {
		t.Fatal(err)
	}
	task, err := fileStore.CreateTask(ctx, model.Task{
		AgentSpaceName: space.Name,
		Instruction:    "Generate inspection report",
		Source:         model.TaskSourceAutomationSchedule,
		AutomationID:   "automation-1",
	})
	if err != nil {
		t.Fatal(err)
	}

	service := NewService(fileStore, "", "")
	service.modelFactory = func(context.Context, model.LLMConfig, model.EnvVars) (adkmodel.LLM, error) {
		return &singleResponseModel{text: "巡检完成，未发现异常。"}, nil
	}
	service.automationNotifier = automationNotifierFunc(func(_ context.Context, _ model.AgentSpace, gotTask model.Task) (bool, error) {
		if gotTask.Status != model.StatusCompleted {
			t.Fatalf("notified task status = %s", gotTask.Status)
		}
		return false, errors.New("wecom unavailable")
	})

	service.ExecuteTask(space.Name, task.ID)

	updated, err := fileStore.GetTask(ctx, space.Name, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Status != model.StatusCompleted {
		t.Fatalf("status = %s output = %+v", updated.Status, updated.Output)
	}
	records, err := fileStore.ListRecords(ctx, space.Name, task.ID, "", "")
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, record := range records {
		if strings.Contains(record.Content, "企业微信自动化结果通知发送失败") {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("wecom failure record not found: %+v", records)
	}
}
