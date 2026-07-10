package agent

import (
	"context"
	"testing"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/model"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/store"
)

type approvalNotifierFunc func(context.Context, model.AgentSpace, model.Task) (bool, error)

func (f approvalNotifierFunc) NotifyTaskAwaitingApproval(ctx context.Context, space model.AgentSpace, task model.Task) (bool, error) {
	return f(ctx, space, task)
}

func TestCreateTaskSendsApprovalNotification(t *testing.T) {
	ctx := context.Background()
	fileStore := store.New(t.TempDir())
	space, err := fileStore.CreateAgentSpace(ctx, model.AgentSpace{Name: "test"})
	if err != nil {
		t.Fatal(err)
	}
	service := NewService(fileStore, "", "")
	var called bool
	service.approvalNotifier = approvalNotifierFunc(func(_ context.Context, gotSpace model.AgentSpace, task model.Task) (bool, error) {
		called = true
		if gotSpace.Name != space.Name {
			t.Fatalf("space name = %q", gotSpace.Name)
		}
		if task.Status != model.StatusAwaitingInput {
			t.Fatalf("task status = %q", task.Status)
		}
		return true, nil
	})

	task, err := service.CreateTask(ctx, model.Task{
		AgentSpaceName: space.Name,
		Instruction:  "请重启 validator 服务",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !called {
		t.Fatal("approval notifier was not called")
	}
	if task.Status != model.StatusAwaitingInput {
		t.Fatalf("status = %s", task.Status)
	}
	records, err := fileStore.ListRecords(ctx, space.Name, task.ID, "", "")
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, record := range records {
		if record.Content == "企业微信审批通知已发送。" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("notification status record not found: %+v", records)
	}
}
