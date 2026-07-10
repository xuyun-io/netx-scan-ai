package automation

import (
	"context"
	"testing"
	"time"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/agent"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/model"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/store"
)

func TestCreateAutomationPersistsNormalizedSchedule(t *testing.T) {
	ctx := context.Background()
	fileStore := store.New(t.TempDir())
	space, err := fileStore.CreateAgentSpace(ctx, model.AgentSpace{Name: "test"})
	if err != nil {
		t.Fatal(err)
	}
	service := NewService(fileStore, agent.NewService(fileStore, "", ""))

	created, err := service.CreateAutomation(ctx, model.Automation{
		AgentSpaceName: space.Name,
		Name:         "Daily inspection",
		Instruction:  "Generate a validator inspection report",
		Schedule: model.AutomationSchedule{
			Frequency: model.AutomationFrequencyDaily,
			Interval:  1,
			Hour:      8,
			Minute:    0,
			Timezone:  "Asia/Shanghai",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.ID == "" || !created.Enabled || created.Status != model.AutomationStatusActive {
		t.Fatalf("created automation = %+v", created)
	}
	if created.Schedule.Cron == "" || created.Schedule.Summary == "" {
		t.Fatalf("schedule was not normalized: %+v", created.Schedule)
	}

	loaded, err := fileStore.GetAutomation(ctx, space.Name, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Schedule.Summary != "Every day at 08:00" {
		t.Fatalf("summary = %q", loaded.Schedule.Summary)
	}
}

func TestShouldRunRespectsWeeklyInterval(t *testing.T) {
	created := time.Date(2026, 7, 1, 9, 0, 0, 0, time.UTC)
	automation := model.Automation{
		CreatedAt: created,
		Schedule: model.AutomationSchedule{
			Frequency: model.AutomationFrequencyWeekly,
			Interval:  2,
			Timezone:  "UTC",
		},
	}
	if !shouldRun(automation, created.AddDate(0, 0, 5)) {
		t.Fatal("first scheduled week should run")
	}
	if shouldRun(automation, created.AddDate(0, 0, 12)) {
		t.Fatal("second scheduled week should be skipped")
	}
	if !shouldRun(automation, created.AddDate(0, 0, 19)) {
		t.Fatal("third scheduled week should run")
	}
}
