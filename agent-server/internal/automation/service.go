package automation

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/robfig/cron/v3"
	"go.uber.org/zap"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/agent"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/model"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/store"
)

const defaultTimezone = "Asia/Shanghai"

type Service struct {
	store   *store.Store
	agent   *agent.Service
	cron    *cron.Cron
	parser  cron.Parser
	entries map[string]cron.EntryID
	started bool
	mu      sync.Mutex
}

func NewService(store *store.Store, agentService *agent.Service) *Service {
	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor)
	return &Service{
		store:   store,
		agent:   agentService,
		parser:  parser,
		cron:    cron.New(cron.WithParser(parser), cron.WithChain(cron.SkipIfStillRunning(cron.DefaultLogger))),
		entries: make(map[string]cron.EntryID),
	}
}

func (s *Service) Start(ctx context.Context) error {
	s.mu.Lock()
	if s.started {
		s.mu.Unlock()
		return nil
	}
	s.started = true
	s.mu.Unlock()

	spaces, err := s.store.ListAgentSpaces(ctx)
	if err != nil {
		return err
	}
	for _, space := range spaces {
		automations, err := s.store.ListAutomations(ctx, space.Name)
		if err != nil {
			return err
		}
		for _, automation := range automations {
			if automation.Enabled && automation.Status == model.AutomationStatusActive {
				if err := s.register(automation); err != nil {
					return err
				}
			}
		}
	}
	s.cron.Start()
	zap.L().Info("automation scheduler started", zap.Int("agent_spaces", len(spaces)), zap.Int("entries", len(s.entries)))

	go func() {
		<-ctx.Done()
		s.Stop(context.Background())
	}()
	return nil
}

func (s *Service) Stop(ctx context.Context) {
	s.mu.Lock()
	if !s.started {
		s.mu.Unlock()
		return
	}
	s.started = false
	s.entries = make(map[string]cron.EntryID)
	s.mu.Unlock()

	stopCtx := s.cron.Stop()
	select {
	case <-stopCtx.Done():
	case <-ctx.Done():
	}
	zap.L().Info("automation scheduler stopped")
}

func (s *Service) CreateAutomation(ctx context.Context, automation model.Automation) (model.Automation, error) {
	normalized, err := s.normalizeAutomation(ctx, automation)
	if err != nil {
		return model.Automation{}, err
	}
	created, err := s.store.CreateAutomation(ctx, normalized)
	if err != nil {
		return model.Automation{}, err
	}
	if created.Enabled && created.Status == model.AutomationStatusActive {
		if err := s.register(created); err != nil {
			return model.Automation{}, err
		}
	}
	zap.L().Info("automation created",
		zap.String("agent_space", created.AgentSpaceName),
		zap.String("automation_id", created.ID),
		zap.String("name", created.Name),
		zap.String("schedule", created.Schedule.Summary),
		zap.Bool("enabled", created.Enabled),
	)
	return created, nil
}

func (s *Service) ListAutomations(ctx context.Context, agentSpaceName string) ([]model.Automation, error) {
	if strings.TrimSpace(agentSpaceName) == "" {
		return nil, fmt.Errorf("agentSpaceName is required")
	}
	return s.store.ListAutomations(ctx, agentSpaceName)
}

func (s *Service) GetAutomation(ctx context.Context, agentSpaceName, automationID string) (model.Automation, error) {
	if strings.TrimSpace(agentSpaceName) == "" {
		return model.Automation{}, fmt.Errorf("agentSpaceName is required")
	}
	if strings.TrimSpace(automationID) == "" {
		return model.Automation{}, fmt.Errorf("automationId is required")
	}
	return s.store.GetAutomation(ctx, agentSpaceName, automationID)
}

func (s *Service) SetEnabled(ctx context.Context, agentSpaceName, automationID string, enabled bool) (model.Automation, error) {
	automation, err := s.GetAutomation(ctx, agentSpaceName, automationID)
	if err != nil {
		return model.Automation{}, err
	}
	automation.Enabled = enabled
	if enabled {
		automation.Status = model.AutomationStatusActive
	} else {
		automation.Status = model.AutomationStatusDisabled
	}
	if err := s.store.UpdateAutomation(ctx, automation); err != nil {
		return model.Automation{}, err
	}
	if enabled {
		if err := s.register(automation); err != nil {
			return model.Automation{}, err
		}
	} else {
		s.unregister(automation.AgentSpaceName, automation.ID)
	}
	return automation, nil
}

func (s *Service) DeleteAutomation(ctx context.Context, agentSpaceName, automationID string) error {
	if _, err := s.GetAutomation(ctx, agentSpaceName, automationID); err != nil {
		return err
	}
	s.unregister(agentSpaceName, automationID)
	return s.store.DeleteAutomation(ctx, agentSpaceName, automationID)
}

func (s *Service) UpdateAutomation(ctx context.Context, agentSpaceName, automationID, name, description, instruction string, schedule model.AutomationSchedule) (model.Automation, error) {
	automation, err := s.GetAutomation(ctx, agentSpaceName, automationID)
	if err != nil {
		return model.Automation{}, err
	}
	if strings.TrimSpace(name) != "" {
		automation.Name = strings.TrimSpace(name)
	}
	automation.Description = strings.TrimSpace(description)
	if strings.TrimSpace(instruction) != "" {
		automation.Instruction = strings.TrimSpace(instruction)
	}
	if strings.TrimSpace(schedule.Frequency) != "" && !scheduleEqual(automation.Schedule, schedule) {
		schedule.Frequency = strings.ToLower(strings.TrimSpace(schedule.Frequency))
		normalizedSchedule, err := s.normalizeSchedule(schedule)
		if err != nil {
			return model.Automation{}, err
		}
		automation.Schedule = normalizedSchedule
	}
	automation.UpdatedAt = time.Now().UTC()
	if err := s.store.UpdateAutomation(ctx, automation); err != nil {
		return model.Automation{}, err
	}
	if automation.Enabled && automation.Status == model.AutomationStatusActive {
		if err := s.register(automation); err != nil {
			return model.Automation{}, err
		}
	}
	return automation, nil
}

func scheduleEqual(a, b model.AutomationSchedule) bool {
	return strings.EqualFold(a.Frequency, b.Frequency) &&
		a.Interval == b.Interval &&
		a.Minute == b.Minute &&
		a.Hour == b.Hour &&
		a.DayOfWeek == b.DayOfWeek &&
		a.DayOfMonth == b.DayOfMonth &&
		a.Timezone == b.Timezone
}

func (s *Service) RunOnce(ctx context.Context, agentSpaceName, automationID string) (model.Task, error) {
	automation, err := s.GetAutomation(ctx, agentSpaceName, automationID)
	if err != nil {
		return model.Task{}, err
	}
	if !automation.Enabled || automation.Status != model.AutomationStatusActive {
		return model.Task{}, fmt.Errorf("automation is disabled")
	}
	task, err := s.agent.CreateTask(ctx, model.Task{
		AgentSpaceName: automation.AgentSpaceName,
		Name:           automation.Name,
		Description:    fmt.Sprintf("Triggered manually by automation %s", automation.Name),
		Type:           "diagnosis",
		Source:         model.TaskSourceAutomationOnce,
		AutomationID:   automation.ID,
		Instruction:    automation.Instruction,
		PreAuthorized:  false,
	})
	if err != nil {
		return model.Task{}, err
	}
	zap.L().Info("automation run once triggered",
		zap.String("agent_space", automation.AgentSpaceName),
		zap.String("automation_id", automation.ID),
		zap.String("task_id", task.ID),
	)
	now := time.Now().UTC()
	automation.LastTriggeredAt = &now
	if err := s.store.UpdateAutomation(ctx, automation); err != nil {
		zap.L().Warn("update automation lastTriggeredAt failed", zap.String("agent_space", agentSpaceName), zap.String("automation_id", automationID), zap.Error(err))
	}
	return task, nil
}

func (s *Service) normalizeAutomation(ctx context.Context, automation model.Automation) (model.Automation, error) {
	automation.AgentSpaceName = strings.TrimSpace(automation.AgentSpaceName)
	if automation.AgentSpaceName == "" {
		return model.Automation{}, fmt.Errorf("agentSpaceName is required")
	}
	if _, err := s.store.GetAgentSpace(ctx, automation.AgentSpaceName); err != nil {
		return model.Automation{}, fmt.Errorf("agentSpaceName is invalid: %w", err)
	}
	automation.Instruction = strings.TrimSpace(automation.Instruction)
	if automation.Instruction == "" {
		return model.Automation{}, fmt.Errorf("instruction is required")
	}
	automation.Name = strings.TrimSpace(automation.Name)
	automation.Description = strings.TrimSpace(automation.Description)
	if automation.TriggerType == "" {
		automation.TriggerType = model.AutomationTriggerSchedule
	}
	if automation.TriggerType != model.AutomationTriggerSchedule {
		return model.Automation{}, fmt.Errorf("unsupported automation trigger %q", automation.TriggerType)
	}
	if !automation.Enabled && automation.Status == "" {
		automation.Enabled = true
	}
	if automation.Enabled {
		automation.Status = model.AutomationStatusActive
	} else if automation.Status == "" {
		automation.Status = model.AutomationStatusDisabled
	}
	schedule, err := s.normalizeSchedule(automation.Schedule)
	if err != nil {
		return model.Automation{}, err
	}
	automation.Schedule = schedule
	return automation, nil
}

func (s *Service) normalizeSchedule(schedule model.AutomationSchedule) (model.AutomationSchedule, error) {
	schedule.Frequency = strings.ToLower(strings.TrimSpace(schedule.Frequency))
	if schedule.Frequency == "" {
		return model.AutomationSchedule{}, fmt.Errorf("schedule.frequency is required")
	}
	if schedule.Interval <= 0 {
		schedule.Interval = 1
	}
	if schedule.Minute < 0 || schedule.Minute > 59 {
		return model.AutomationSchedule{}, fmt.Errorf("schedule.minute must be between 0 and 59")
	}
	if schedule.Hour < 0 || schedule.Hour > 23 {
		return model.AutomationSchedule{}, fmt.Errorf("schedule.hour must be between 0 and 23")
	}
	schedule.Timezone = strings.TrimSpace(schedule.Timezone)
	if schedule.Timezone == "" {
		schedule.Timezone = defaultTimezone
	}
	if _, err := time.LoadLocation(schedule.Timezone); err != nil {
		return model.AutomationSchedule{}, fmt.Errorf("invalid schedule.timezone %q: %w", schedule.Timezone, err)
	}

	switch schedule.Frequency {
	case model.AutomationFrequencyHourly:
		schedule.Cron = fmt.Sprintf("CRON_TZ=%s %d * * * *", schedule.Timezone, schedule.Minute)
		schedule.Summary = hourlySummary(schedule.Interval, schedule.Minute)
	case model.AutomationFrequencyDaily:
		schedule.Cron = fmt.Sprintf("CRON_TZ=%s %d %d * * *", schedule.Timezone, schedule.Minute, schedule.Hour)
		schedule.Summary = dailySummary(schedule.Interval, schedule.Hour, schedule.Minute)
	case model.AutomationFrequencyWeekly:
		if schedule.DayOfWeek == 0 {
			schedule.DayOfWeek = 1
		}
		weekday, err := cronWeekday(schedule.DayOfWeek)
		if err != nil {
			return model.AutomationSchedule{}, err
		}
		schedule.Cron = fmt.Sprintf("CRON_TZ=%s %d %d * * %s", schedule.Timezone, schedule.Minute, schedule.Hour, weekday)
		schedule.Summary = weeklySummary(schedule.Interval, schedule.DayOfWeek, schedule.Hour, schedule.Minute)
	case model.AutomationFrequencyMonthly:
		if schedule.DayOfMonth == 0 {
			schedule.DayOfMonth = 1
		}
		if schedule.DayOfMonth < 1 || schedule.DayOfMonth > 31 {
			return model.AutomationSchedule{}, fmt.Errorf("schedule.dayOfMonth must be between 1 and 31")
		}
		schedule.Cron = fmt.Sprintf("CRON_TZ=%s %d %d %d * *", schedule.Timezone, schedule.Minute, schedule.Hour, schedule.DayOfMonth)
		schedule.Summary = monthlySummary(schedule.Interval, schedule.DayOfMonth, schedule.Hour, schedule.Minute)
	default:
		return model.AutomationSchedule{}, fmt.Errorf("unsupported schedule.frequency %q", schedule.Frequency)
	}
	if _, err := s.parser.Parse(schedule.Cron); err != nil {
		return model.AutomationSchedule{}, fmt.Errorf("invalid cron schedule: %w", err)
	}
	return schedule, nil
}

func (s *Service) register(automation model.Automation) error {
	key := entryKey(automation.AgentSpaceName, automation.ID)
	s.mu.Lock()
	defer s.mu.Unlock()
	if existing, ok := s.entries[key]; ok {
		s.cron.Remove(existing)
		delete(s.entries, key)
	}
	agentSpaceName := automation.AgentSpaceName
	automationID := automation.ID
	entryID, err := s.cron.AddFunc(automation.Schedule.Cron, func() {
		s.trigger(context.Background(), agentSpaceName, automationID)
	})
	if err != nil {
		return err
	}
	s.entries[key] = entryID
	zap.L().Info("automation registered",
		zap.String("agent_space", automation.AgentSpaceName),
		zap.String("automation_id", automation.ID),
		zap.String("cron", automation.Schedule.Cron),
	)
	return nil
}

func (s *Service) unregister(agentSpaceName, automationID string) {
	key := entryKey(agentSpaceName, automationID)
	s.mu.Lock()
	defer s.mu.Unlock()
	if existing, ok := s.entries[key]; ok {
		s.cron.Remove(existing)
		delete(s.entries, key)
		zap.L().Info("automation unregistered", zap.String("agent_space", agentSpaceName), zap.String("automation_id", automationID))
	}
}

func (s *Service) trigger(ctx context.Context, agentSpaceName, automationID string) {
	automation, err := s.store.GetAutomation(ctx, agentSpaceName, automationID)
	if err != nil {
		zap.L().Warn("load automation for trigger failed", zap.String("agent_space", agentSpaceName), zap.String("automation_id", automationID), zap.Error(err))
		return
	}
	if !automation.Enabled || automation.Status != model.AutomationStatusActive {
		return
	}
	now := time.Now().UTC()
	if !shouldRun(automation, now) {
		zap.L().Debug("automation trigger skipped by interval",
			zap.String("agent_space", agentSpaceName),
			zap.String("automation_id", automationID),
			zap.String("frequency", automation.Schedule.Frequency),
			zap.Int("interval", automation.Schedule.Interval),
		)
		return
	}
	task, err := s.agent.CreateTask(ctx, model.Task{
		AgentSpaceName: automation.AgentSpaceName,
		Name:           automation.Name,
		Description:    fmt.Sprintf("Triggered by automation %s", automation.Name),
		Type:           "diagnosis",
		Source:         model.TaskSourceAutomationSchedule,
		AutomationID:   automation.ID,
		Instruction:    automation.Instruction,
		PreAuthorized:  false,
	})
	if err != nil {
		zap.L().Error("trigger automation task failed", zap.String("agent_space", agentSpaceName), zap.String("automation_id", automationID), zap.Error(err))
		return
	}
	zap.L().Info("automation schedule triggered",
		zap.String("agent_space", automation.AgentSpaceName),
		zap.String("automation_id", automation.ID),
		zap.String("task_id", task.ID),
	)
	automation.LastTriggeredAt = &now
	automation.Status = model.AutomationStatusActive
	if err := s.store.UpdateAutomation(ctx, automation); err != nil {
		zap.L().Warn("update automation lastTriggeredAt failed", zap.String("agent_space", agentSpaceName), zap.String("automation_id", automationID), zap.Error(err))
	}
}

func shouldRun(automation model.Automation, now time.Time) bool {
	interval := automation.Schedule.Interval
	if interval <= 1 || automation.CreatedAt.IsZero() {
		return true
	}
	loc, err := time.LoadLocation(automation.Schedule.Timezone)
	if err != nil {
		loc = time.UTC
	}
	created := automation.CreatedAt.In(loc)
	current := now.In(loc)
	if current.Before(created) {
		return false
	}
	switch automation.Schedule.Frequency {
	case model.AutomationFrequencyHourly:
		createdHour := created.Truncate(time.Hour)
		currentHour := current.Truncate(time.Hour)
		hours := int(currentHour.Sub(createdHour).Hours())
		return hours >= 0 && hours%interval == 0
	case model.AutomationFrequencyDaily:
		days := int(dateOnly(current).Sub(dateOnly(created)).Hours() / 24)
		return days >= 0 && days%interval == 0
	case model.AutomationFrequencyWeekly:
		weeks := int(dateOnly(current).Sub(dateOnly(created)).Hours() / 24 / 7)
		return weeks >= 0 && weeks%interval == 0
	case model.AutomationFrequencyMonthly:
		createdYear, createdMonth, _ := created.Date()
		currentYear, currentMonth, _ := current.Date()
		months := (currentYear-createdYear)*12 + int(currentMonth-createdMonth)
		return months >= 0 && months%interval == 0
	default:
		return true
	}
}

func dateOnly(t time.Time) time.Time {
	year, month, day := t.Date()
	return time.Date(year, month, day, 0, 0, 0, 0, t.Location())
}

func entryKey(agentSpaceName, automationID string) string {
	return agentSpaceName + "/" + automationID
}

func cronWeekday(day int) (string, error) {
	switch day {
	case 1:
		return "MON", nil
	case 2:
		return "TUE", nil
	case 3:
		return "WED", nil
	case 4:
		return "THU", nil
	case 5:
		return "FRI", nil
	case 6:
		return "SAT", nil
	case 7:
		return "SUN", nil
	default:
		return "", fmt.Errorf("schedule.dayOfWeek must be between 1 and 7")
	}
}

func weekdayName(day int) string {
	switch day {
	case 1:
		return "Monday"
	case 2:
		return "Tuesday"
	case 3:
		return "Wednesday"
	case 4:
		return "Thursday"
	case 5:
		return "Friday"
	case 6:
		return "Saturday"
	case 7:
		return "Sunday"
	default:
		return "Monday"
	}
}

func hourlySummary(interval, minute int) string {
	if interval <= 1 {
		return fmt.Sprintf("Every hour at minute %02d", minute)
	}
	return fmt.Sprintf("Every %d hours at minute %02d", interval, minute)
}

func dailySummary(interval, hour, minute int) string {
	if interval <= 1 {
		return fmt.Sprintf("Every day at %02d:%02d", hour, minute)
	}
	return fmt.Sprintf("Every %d days at %02d:%02d", interval, hour, minute)
}

func weeklySummary(interval, day, hour, minute int) string {
	if interval <= 1 {
		return fmt.Sprintf("Every %s at %02d:%02d", weekdayName(day), hour, minute)
	}
	return fmt.Sprintf("Every %d weeks on %s at %02d:%02d", interval, weekdayName(day), hour, minute)
}

func monthlySummary(interval, day, hour, minute int) string {
	if interval <= 1 {
		return fmt.Sprintf("Every month on day %d at %02d:%02d", day, hour, minute)
	}
	return fmt.Sprintf("Every %d months on day %d at %02d:%02d", interval, day, hour, minute)
}
