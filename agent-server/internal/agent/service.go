package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/localtrace"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/model"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/notify"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/skills"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/store"
	"go.uber.org/zap"
	"google.golang.org/adk/v2/agent"
	adkartifact "google.golang.org/adk/v2/artifact"
	adkmodel "google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/model/gemini"
	adkplugin "google.golang.org/adk/v2/plugin"
	"google.golang.org/adk/v2/runner"
	adksession "google.golang.org/adk/v2/session"
	adktool "google.golang.org/adk/v2/tool"
	"google.golang.org/genai"
)

type Service struct {
	store              *store.Store
	skillRunner        *skills.Runner
	skillToolset       *ADKSkillToolset
	skillActionTool    adktool.Tool
	sessionService     adksession.Service
	artifactService    adkartifact.Service
	approvalNotifier   approvalNotifier
	automationNotifier automationTaskNotifier
	wecomClient        notify.WeComClient
	modelFactory       func(context.Context, model.LLMConfig, model.EnvVars) (adkmodel.LLM, error)
	localTraceRepo     localtrace.Repository
	taskCancels        map[string]context.CancelFunc
	mu                 sync.Mutex
}

type approvalNotifier interface {
	NotifyTaskAwaitingApproval(context.Context, model.AgentSpace, model.Task) (bool, error)
}

type automationTaskNotifier interface {
	NotifyAutomationTaskFinished(context.Context, model.AgentSpace, model.Task) (bool, error)
}

func NewService(store *store.Store, publicURL, skillsDir string) *Service {
	runner := skills.NewRunner(skills.Config{RootDir: skillsDir})
	toolset, _ := NewADKSkillToolset(context.Background(), runner.RootDir())
	actionTool, _ := skills.NewExecuteActionTool(runner)
	wecomClient := notify.WeComClient{PublicURL: publicURL}
	return &Service{
		store:              store,
		skillRunner:        runner,
		skillToolset:       toolset,
		skillActionTool:    actionTool,
		sessionService:     adksession.InMemoryService(),
		artifactService:    newFileArtifactService(store.Root()),
		approvalNotifier:   wecomClient,
		automationNotifier: wecomClient,
		wecomClient:        wecomClient,
		modelFactory:       newGeminiModel,
		localTraceRepo:     localtrace.NewFileRepository(store.Root()),
	}
}

func (s *Service) registerTaskCancel(taskID string, cancel context.CancelFunc) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.taskCancels == nil {
		s.taskCancels = make(map[string]context.CancelFunc)
	}
	s.taskCancels[taskID] = cancel
}

func (s *Service) unregisterTaskCancel(taskID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.taskCancels, taskID)
}

func (s *Service) cancelTaskRun(taskID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if cancel, ok := s.taskCancels[taskID]; ok {
		cancel()
		return true
	}
	return false
}

func (s *Service) CreateTurn(ctx context.Context, agentSpaceName, conversationID, prompt string) (model.Turn, error) {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return model.Turn{}, fmt.Errorf("prompt is required")
	}
	if len([]rune(prompt)) > store.MaxMessageChars {
		return model.Turn{}, fmt.Errorf("prompt exceeds %d characters", store.MaxMessageChars)
	}
	now := time.Now().UTC()
	turn := model.Turn{
		ID:             store.NewTurnID(),
		ConversationID: conversationID,
		AgentSpaceName: agentSpaceName,
		Status:         model.StatusInProgress,
		Prompt:         prompt,
		DocumentIDs:    []string{},
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if err := s.store.AppendTurn(ctx, turn); err != nil {
		return model.Turn{}, err
	}
	zap.L().Info("turn created",
		zap.String("agent_space", turn.AgentSpaceName),
		zap.String("conversation_id", turn.ConversationID),
		zap.String("turn_id", turn.ID),
		zap.Int("prompt_chars", len([]rune(prompt))),
	)
	go s.processTurn(turn)
	return turn, nil
}

func (s *Service) CreateTask(ctx context.Context, task model.Task) (model.Task, error) {
	task.Instruction = strings.TrimSpace(task.Instruction)
	if task.Instruction == "" {
		return model.Task{}, fmt.Errorf("instruction is required")
	}
	if task.AgentSpaceName == "" {
		return model.Task{}, fmt.Errorf("agentSpaceName is required")
	}
	source, err := normalizeTaskSource(task.Source)
	if err != nil {
		return model.Task{}, err
	}
	task.Source = source
	task.RequiresApproval = task.RequiresApproval || requiresApproval(task.Instruction)
	if task.RequiresApproval && !task.PreAuthorized {
		task.Status = model.StatusAwaitingInput
	} else {
		task.Status = model.StatusPending
	}
	created, err := s.store.CreateTask(ctx, task)
	if err != nil {
		return model.Task{}, err
	}
	_ = s.store.AppendTaskRecord(ctx, model.Record{
		ID:             store.NewRecordID(),
		AgentSpaceName: created.AgentSpaceName,
		TaskID:         created.ID,
		Type:           model.RecordStatus,
		Content:        fmt.Sprintf("任务已创建，当前状态：%s", created.Status),
		CreatedAt:      time.Now().UTC(),
	})
	if created.Status != model.StatusAwaitingInput {
		go s.ExecuteTask(created.AgentSpaceName, created.ID)
	} else {
		s.notifyTaskAwaitingApproval(ctx, created)
	}
	zap.L().Info("task created",
		zap.String("agent_space", created.AgentSpaceName),
		zap.String("task_id", created.ID),
		zap.String("source", created.Source),
		zap.String("status", created.Status),
		zap.String("automation_id", created.AutomationID),
		zap.Bool("requires_approval", created.RequiresApproval),
		zap.Bool("pre_authorized", created.PreAuthorized),
	)
	return created, nil
}

func (s *Service) RespondToTask(ctx context.Context, agentSpaceName, taskID, response, userID string) (model.Task, error) {
	task, err := s.store.GetTask(ctx, agentSpaceName, taskID)
	if err != nil {
		return model.Task{}, err
	}
	if task.Status != model.StatusAwaitingInput {
		return model.Task{}, fmt.Errorf("task is not awaiting input")
	}
	approved := strings.EqualFold(response, "approve") || strings.EqualFold(response, "approved") || response == "同意"
	if !approved {
		task.Status = model.StatusFailed
		task.Output = map[string]string{"reason": "审批拒绝"}
		task.CompletedAt = ptrTime(time.Now().UTC())
		if err := s.store.UpdateTask(ctx, task); err != nil {
			return model.Task{}, err
		}
		_ = s.store.AppendTaskRecord(ctx, model.Record{
			ID:             store.NewRecordID(),
			AgentSpaceName: agentSpaceName,
			TaskID:         taskID,
			Type:           model.RecordStatus,
			Content:        "审批已拒绝，任务结束。",
			CreatedAt:      time.Now().UTC(),
		})
		zap.L().Info("task approval rejected",
			zap.String("agent_space", agentSpaceName),
			zap.String("task_id", taskID),
			zap.String("user_id", firstNonEmpty(userID, "web-ui")),
		)
		return task, nil
	}
	now := time.Now().UTC()
	task.ApprovedBy = userID
	if task.ApprovedBy == "" {
		task.ApprovedBy = "web-ui"
	}
	task.ApprovedAt = &now
	task.Status = model.StatusPending
	if err := s.store.UpdateTask(ctx, task); err != nil {
		return model.Task{}, err
	}
	_ = s.store.AppendTaskRecord(ctx, model.Record{
		ID:             store.NewRecordID(),
		AgentSpaceName: agentSpaceName,
		TaskID:         taskID,
		Type:           model.RecordStatus,
		Content:        "审批已通过，任务继续执行。",
		CreatedAt:      now,
	})
	zap.L().Info("task approval accepted",
		zap.String("agent_space", agentSpaceName),
		zap.String("task_id", taskID),
		zap.String("user_id", task.ApprovedBy),
	)
	go s.ExecuteTask(agentSpaceName, taskID)
	return task, nil
}

func (s *Service) CancelTask(ctx context.Context, agentSpaceName, taskID string) (model.Task, error) {
	task, err := s.store.GetTask(ctx, agentSpaceName, taskID)
	if err != nil {
		return model.Task{}, err
	}
	if task.Status == model.StatusCompleted || task.Status == model.StatusSuccess || task.Status == model.StatusFailed || task.Status == model.StatusCancelled {
		return model.Task{}, fmt.Errorf("task is already finished")
	}
	s.cancelTaskRun(taskID)
	now := time.Now().UTC()
	task.Status = model.StatusCancelled
	task.CompletedAt = &now
	task.UpdatedAt = now
	if err := s.store.UpdateTask(ctx, task); err != nil {
		return model.Task{}, err
	}
	_ = s.store.AppendTaskRecord(ctx, model.Record{
		ID:             store.NewRecordID(),
		AgentSpaceName: agentSpaceName,
		TaskID:         taskID,
		Type:           model.RecordStatus,
		Content:        "任务已取消。",
		CreatedAt:      now,
	})
	zap.L().Info("task cancelled", zap.String("agent_space", agentSpaceName), zap.String("task_id", taskID))
	return task, nil
}

func (s *Service) notifyTaskAwaitingApproval(ctx context.Context, task model.Task) {
	if s.approvalNotifier == nil {
		return
	}
	space, err := s.store.GetAgentSpace(ctx, task.AgentSpaceName)
	if err != nil {
		zap.L().Warn("approval notification skipped: load agent space failed",
			zap.String("agent_space", task.AgentSpaceName),
			zap.String("task_id", task.ID),
			zap.Error(err),
		)
		s.appendTaskStatus(ctx, task.AgentSpaceName, task.ID, fmt.Sprintf("企业微信审批通知未发送：读取 Agent 配置失败：%s", err))
		return
	}
	sent, err := s.approvalNotifier.NotifyTaskAwaitingApproval(ctx, space, task)
	if err != nil {
		zap.L().Warn("approval notification failed",
			zap.String("agent_space", task.AgentSpaceName),
			zap.String("task_id", task.ID),
			zap.Error(err),
		)
		s.appendTaskStatus(ctx, task.AgentSpaceName, task.ID, fmt.Sprintf("企业微信审批通知发送失败：%s", err))
		return
	}
	if sent {
		zap.L().Info("approval notification sent", zap.String("agent_space", task.AgentSpaceName), zap.String("task_id", task.ID))
		s.appendTaskStatus(ctx, task.AgentSpaceName, task.ID, "企业微信审批通知已发送。")
	}
}

func (s *Service) notifyAutomationTaskFinished(task model.Task) {
	if s.automationNotifier == nil || !isAutomationTaskSource(task.Source) {
		return
	}
	ctx := context.Background()
	space, err := s.store.GetAgentSpace(ctx, task.AgentSpaceName)
	if err != nil {
		zap.L().Warn("automation notification skipped: load agent space failed",
			zap.String("agent_space", task.AgentSpaceName),
			zap.String("task_id", task.ID),
			zap.String("source", task.Source),
			zap.Error(err),
		)
		s.appendTaskStatus(ctx, task.AgentSpaceName, task.ID, fmt.Sprintf("企业微信自动化结果通知未发送：读取 Agent 配置失败：%s", err))
		return
	}
	sent, err := s.automationNotifier.NotifyAutomationTaskFinished(ctx, space, task)
	if err != nil {
		zap.L().Warn("automation notification failed",
			zap.String("agent_space", task.AgentSpaceName),
			zap.String("task_id", task.ID),
			zap.String("source", task.Source),
			zap.String("status", task.Status),
			zap.Error(err),
		)
		s.appendTaskStatus(ctx, task.AgentSpaceName, task.ID, fmt.Sprintf("企业微信自动化结果通知发送失败：%s", err))
		return
	}
	if sent {
		zap.L().Info("automation notification sent",
			zap.String("agent_space", task.AgentSpaceName),
			zap.String("task_id", task.ID),
			zap.String("source", task.Source),
			zap.String("status", task.Status),
		)
		s.appendTaskStatus(ctx, task.AgentSpaceName, task.ID, "企业微信自动化结果通知已发送。")
	}
}

func isAutomationTaskSource(source string) bool {
	switch source {
	case model.TaskSourceAutomationOnce, model.TaskSourceAutomationSchedule, model.TaskSourceAutomationEvent:
		return true
	default:
		return false
	}
}

func (s *Service) appendTaskStatus(ctx context.Context, agentSpaceName, taskID, content string) {
	_ = s.store.AppendTaskRecord(ctx, model.Record{
		ID:             store.NewRecordID(),
		AgentSpaceName: agentSpaceName,
		TaskID:         taskID,
		Type:           model.RecordStatus,
		Content:        content,
		CreatedAt:      time.Now().UTC(),
	})
}

func (s *Service) ExecuteTask(agentSpaceName, taskID string) {
	ctx, cancel := context.WithCancel(context.Background())
	s.registerTaskCancel(taskID, cancel)
	defer s.unregisterTaskCancel(taskID)

	task, err := s.store.GetTask(ctx, agentSpaceName, taskID)
	if err != nil {
		zap.L().Warn("execute task skipped: load task failed", zap.String("agent_space", agentSpaceName), zap.String("task_id", taskID), zap.Error(err))
		return
	}
	now := time.Now().UTC()
	task.Status = model.StatusInProgress
	task.StartedAt = &now
	task.UpdatedAt = now
	if err := s.store.UpdateTask(ctx, task); err != nil {
		return
	}
	_ = s.store.AppendTaskRecord(ctx, model.Record{
		ID:             store.NewRecordID(),
		AgentSpaceName: agentSpaceName,
		TaskID:         taskID,
		Type:           model.RecordStatus,
		Content:        "任务开始执行。",
		CreatedAt:      now,
	})
	zap.L().Info("task execution started",
		zap.String("agent_space", agentSpaceName),
		zap.String("task_id", taskID),
		zap.String("source", task.Source),
		zap.String("automation_id", task.AutomationID),
	)
	response, err := s.runADKTask(ctx, task)
	if err != nil {
		completedAt := time.Now().UTC()
		if ctx.Err() != nil || errors.Is(err, context.Canceled) {
			task.Status = model.StatusCancelled
			_ = s.store.AppendTaskRecord(ctx, model.Record{
				ID:             store.NewRecordID(),
				AgentSpaceName: agentSpaceName,
				TaskID:         taskID,
				Type:           model.RecordStatus,
				Content:        "任务已取消。",
				CreatedAt:      completedAt,
			})
		} else {
			task.Status = model.StatusFailed
			_ = s.store.AppendTaskRecord(ctx, model.Record{
				ID:             store.NewRecordID(),
				AgentSpaceName: agentSpaceName,
				TaskID:         taskID,
				Type:           model.RecordError,
				Content:        err.Error(),
				CreatedAt:      completedAt,
			})
		}
		task.CompletedAt = &completedAt
		task.Output = map[string]string{"error": err.Error()}
		_ = s.store.UpdateTask(ctx, task)
		zap.L().Error("task execution finished with error",
			zap.String("agent_space", agentSpaceName),
			zap.String("task_id", taskID),
			zap.String("status", task.Status),
			zap.String("source", task.Source),
			zap.Duration("duration", completedAt.Sub(now)),
			zap.Error(err),
		)
		var turnStatus string
		if task.Status == model.StatusCancelled {
			turnStatus = model.StatusCancelled
		} else {
			turnStatus = model.StatusFailed
		}
		s.updateLinkedTurn(ctx, task, err.Error(), turnStatus, completedAt)
		s.notifyAutomationTaskFinished(task)
		return
	}
	if latest, err := s.store.GetTask(ctx, agentSpaceName, taskID); err == nil {
		task = latest
	}
	completedAt := time.Now().UTC()
	task.Status = model.StatusCompleted
	task.CompletedAt = &completedAt
	task.Output = map[string]string{
		"summary": response,
	}
	_ = s.store.UpdateTask(ctx, task)
	_ = s.store.AppendTaskRecord(ctx, model.Record{
		ID:             store.NewRecordID(),
		AgentSpaceName: agentSpaceName,
		TaskID:         taskID,
		Type:           model.RecordResponse,
		Content:        task.Output["summary"],
		CreatedAt:      completedAt,
	})
	if task.ConversationID != "" && task.TurnID != "" {
		s.updateLinkedTurn(ctx, task, response, model.StatusSuccess, completedAt)
	}
	zap.L().Info("task execution completed",
		zap.String("agent_space", agentSpaceName),
		zap.String("task_id", taskID),
		zap.String("source", task.Source),
		zap.String("automation_id", task.AutomationID),
		zap.Duration("duration", completedAt.Sub(now)),
		zap.Int("artifacts", len(task.Artifacts)),
	)
	s.notifyAutomationTaskFinished(task)
}

func (s *Service) processTurn(turn model.Turn) {
	ctx := context.Background()
	startedAt := time.Now().UTC()
	zap.L().Info("turn processing started",
		zap.String("agent_space", turn.AgentSpaceName),
		zap.String("conversation_id", turn.ConversationID),
		zap.String("turn_id", turn.ID),
	)
	response, err := s.runADKTurn(ctx, turn)
	completedAt := time.Now().UTC()
	if err != nil {
		turn.Status = model.StatusFailed
		turn.StatusReason = err.Error()
		turn.Output = &model.TurnOutput{ArtifactIDs: []string{}, Text: err.Error()}
		turn.CompletedAt = &completedAt
		turn.UpdatedAt = completedAt
		_ = s.store.UpdateTurn(ctx, turn)
		_ = s.store.AppendConversationRecord(ctx, model.Record{
			ID:             store.NewRecordID(),
			AgentSpaceName: turn.AgentSpaceName,
			ConversationID: turn.ConversationID,
			TurnID:         turn.ID,
			Type:           model.RecordError,
			Content:        err.Error(),
			CreatedAt:      turn.UpdatedAt,
		})
		zap.L().Error("turn processing failed",
			zap.String("agent_space", turn.AgentSpaceName),
			zap.String("conversation_id", turn.ConversationID),
			zap.String("turn_id", turn.ID),
			zap.Duration("duration", completedAt.Sub(startedAt)),
			zap.Error(err),
		)
		return
	}
	response = sanitizeFinalText(response)
	turn.Status = model.StatusSuccess
	turn.Output = &model.TurnOutput{ArtifactIDs: []string{}, Text: response}
	turn.CompletedAt = &completedAt
	turn.UpdatedAt = completedAt
	_ = s.store.UpdateTurn(ctx, turn)
	_ = s.store.AppendConversationRecord(ctx, model.Record{
		ID:             store.NewRecordID(),
		AgentSpaceName: turn.AgentSpaceName,
		ConversationID: turn.ConversationID,
		TurnID:         turn.ID,
		Type:           model.RecordResponse,
		Content:        response,
		CreatedAt:      turn.UpdatedAt,
	})
	zap.L().Info("turn processing completed",
		zap.String("agent_space", turn.AgentSpaceName),
		zap.String("conversation_id", turn.ConversationID),
		zap.String("turn_id", turn.ID),
		zap.Duration("duration", completedAt.Sub(startedAt)),
	)
}

func (s *Service) runADKTurn(ctx context.Context, turn model.Turn) (string, error) {
	return s.runADKPrompt(ctx, RunScope{
		AgentSpaceName: turn.AgentSpaceName,
		SessionID:      turn.ConversationID,
		ConversationID: turn.ConversationID,
		TurnID:         turn.ID,
		Source:         "chat",
	}, turn.Prompt, func(event *adksession.Event) {
		s.appendADKEventRecord(ctx, turn, event)
	})
}

func (s *Service) runADKTask(ctx context.Context, task model.Task) (string, error) {
	sessionID := task.ID
	if task.ConversationID != "" {
		sessionID = task.ConversationID
	}
	return s.runADKPrompt(ctx, RunScope{
		AgentSpaceName: task.AgentSpaceName,
		SessionID:      sessionID,
		TaskID:         task.ID,
		ConversationID: task.ConversationID,
		TurnID:         task.TurnID,
		Source:         task.Source,
	}, task.Instruction, func(event *adksession.Event) {
		s.appendADKTaskEventRecord(ctx, task, event)
	})
}

type RunScope struct {
	AgentSpaceName string
	SessionID      string
	TaskID         string
	ConversationID string
	TurnID         string
	Source         string
}

func (s *Service) runADKPrompt(ctx context.Context, scope RunScope, prompt string, recordEvent func(*adksession.Event)) (string, error) {
	agentSpaceName, sessionID, taskID := scope.AgentSpaceName, scope.SessionID, scope.TaskID
	space, err := s.store.GetAgentSpace(ctx, agentSpaceName)
	if err != nil {
		return "", fmt.Errorf("load agent space: %w", err)
	}
	zap.L().Debug("creating ADK runtime",
		zap.String("agent_space", agentSpaceName),
		zap.String("session_id", sessionID),
		zap.String("task_id", taskID),
		zap.String("llm_provider", space.LLM.Provider),
		zap.String("llm_model", space.LLM.Model),
		zap.Bool("wecom_enabled", space.Integrations.WeCom.Enabled),
	)
	llm, err := s.modelFactory(ctx, space.LLM, space.Environment)
	if err != nil {
		return "", fmt.Errorf("create ADK model: %w", err)
	}
	toolEnv := cloneEnvVars(space.Environment)
	runID := firstNonEmpty(taskID, sessionID)
	stagingDir, err := s.prepareArtifactStagingDir(agentSpaceName, runID)
	if err != nil {
		return "", fmt.Errorf("prepare artifact staging dir: %w", err)
	}
	if stagingDir != "" {
		toolEnv["NETX_ARTIFACT_DIR"] = stagingDir
	}
	if taskID != "" {
		toolEnv["NETX_TASK_ID"] = taskID
	}
	traceDir, err := filepath.Abs(filepath.Join(s.store.Root(), agentSpaceName, "traces"))
	if err != nil {
		return "", fmt.Errorf("resolve local trace directory: %w", err)
	}
	toolEnv["NETX_LOCAL_TRACE_DIR"] = traceDir
	artifactTools, err := newArtifactTools(s.store, agentSpaceName, taskID, stagingDir)
	if err != nil {
		return "", fmt.Errorf("create artifact tools: %w", err)
	}
	extraTools := append([]adktool.Tool{}, artifactTools...)
	wecomTools, err := newWeComTools(space, s.wecomClient)
	if err != nil {
		return "", fmt.Errorf("create wecom tools: %w", err)
	}
	extraTools = append(extraTools, wecomTools...)
	tracePlugin, err := localtrace.NewPlugin(localtrace.PluginConfig{
		Repository: s.localTraceRepo,
		Scope: localtrace.Scope{
			AgentSpaceName: agentSpaceName,
			TaskID:         taskID,
			SessionID:      sessionID,
			ConversationID: scope.ConversationID,
			TurnID:         scope.TurnID,
			Source:         scope.Source,
		},
	})
	if err != nil {
		return "", fmt.Errorf("create local trace plugin: %w", err)
	}
	adkAgent, err := NewADKChainAgentWithEnv(ctx, llm, s.skillRunner.RootDir(), s.skillRunner, toolEnv, extraTools...)
	if err != nil {
		return "", fmt.Errorf("create ADK agent: %w", err)
	}
	adkRunner, err := runner.New(runner.Config{
		AppName:         "netx-chain287",
		Agent:           adkAgent,
		SessionService:  s.sessionService,
		ArtifactService: s.artifactService,
		PluginConfig: runner.PluginConfig{
			Plugins: []*adkplugin.Plugin{tracePlugin},
		},
		AutoCreateSession: true,
	})
	if err != nil {
		return "", fmt.Errorf("create ADK runner: %w", err)
	}

	content := genai.NewContentFromText(prompt, genai.RoleUser)
	var finalText string
	startedAt := time.Now().UTC()
	traceSummary := localtrace.InvocationSummary{
		Version: "1.0",
		Scope: localtrace.Scope{
			AgentSpaceName: agentSpaceName, TaskID: taskID, SessionID: sessionID,
			ConversationID: scope.ConversationID, TurnID: scope.TurnID, Source: scope.Source,
		},
		Status: "in_progress", StartedAt: startedAt, ModelCalls: []localtrace.ModelCall{},
	}
	lastObservedAt := startedAt
	for event, err := range adkRunner.Run(ctx, agentSpaceName, sessionID, content, agent.RunConfig{
		StreamingMode: agent.StreamingModeNone,
	}) {
		if err != nil {
			s.finalizeInvocationTrace(ctx, &traceSummary, "failed")
			return "", fmt.Errorf("run ADK agent: %w", err)
		}
		if event == nil {
			continue
		}
		if traceSummary.InvocationID == "" {
			traceSummary.InvocationID = event.InvocationID
		}
		if usage := event.UsageMetadata; usage != nil {
			completedAt := time.Now().UTC()
			functionCallIDs := make([]string, 0)
			if event.Content != nil {
				for _, part := range event.Content.Parts {
					if part != nil && part.FunctionCall != nil && part.FunctionCall.ID != "" {
						functionCallIDs = append(functionCallIDs, part.FunctionCall.ID)
					}
				}
			}
			call := localtrace.ModelCall{
				Sequence: len(traceSummary.ModelCalls) + 1, EventID: event.ID, Model: event.ModelVersion,
				StartedAt: lastObservedAt, CompletedAt: completedAt, DurationMillis: completedAt.Sub(lastObservedAt).Milliseconds(),
				InputTokens: usage.PromptTokenCount, OutputTokens: usage.CandidatesTokenCount,
				CachedInputTokens: usage.CachedContentTokenCount, ToolUseInputTokens: usage.ToolUsePromptTokenCount,
				ReasoningTokens: usage.ThoughtsTokenCount, TotalOutputTokens: usage.CandidatesTokenCount + usage.ThoughtsTokenCount,
				TotalTokens: usage.TotalTokenCount, FinishReason: string(event.FinishReason), FunctionCallIDs: functionCallIDs,
				Timestamp: completedAt,
			}
			traceSummary.ModelCalls = append(traceSummary.ModelCalls, call)
			traceSummary.InputTokens += int64(call.InputTokens)
			traceSummary.OutputTokens += int64(call.OutputTokens)
			traceSummary.CachedInputTokens += int64(call.CachedInputTokens)
			traceSummary.ToolUseInputTokens += int64(call.ToolUseInputTokens)
			traceSummary.ReasoningTokens += int64(call.ReasoningTokens)
			traceSummary.TotalOutputTokens += int64(call.TotalOutputTokens)
			traceSummary.TotalTokens += int64(call.TotalTokens)
		}
		lastObservedAt = time.Now().UTC()
		if traceSummary.InvocationID != "" {
			traceSummary.DurationMillis = time.Since(traceSummary.StartedAt).Milliseconds()
			traceSummary.ModelCallCount = len(traceSummary.ModelCalls)
			_ = s.localTraceRepo.SaveInvocationSummary(ctx, traceSummary)
		}
		if taskID != "" {
			s.persistSkillArtifactCandidates(ctx, agentSpaceName, taskID, stagingDir, event)
		}
		if recordEvent != nil {
			recordEvent(event)
		}
		if event.IsFinalResponse() {
			if text := textFromContent(event.Content); text != "" {
				finalText = sanitizeFinalText(text)
			}
		}
	}
	if strings.TrimSpace(finalText) == "" {
		s.finalizeInvocationTrace(ctx, &traceSummary, "failed")
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		return "", fmt.Errorf("ADK agent produced no final text")
	}
	s.finalizeInvocationTrace(ctx, &traceSummary, "success")
	return finalText, nil
}

func (s *Service) finalizeInvocationTrace(ctx context.Context, summary *localtrace.InvocationSummary, status string) {
	if summary == nil || summary.InvocationID == "" || s.localTraceRepo == nil {
		return
	}
	now := time.Now().UTC()
	summary.Status = status
	summary.CompletedAt = &now
	summary.DurationMillis = now.Sub(summary.StartedAt).Milliseconds()
	summary.ModelCallCount = len(summary.ModelCalls)
	_ = s.localTraceRepo.SaveInvocationSummary(ctx, *summary)
	trace, err := s.localTraceRepo.GetInvocationTrace(ctx, summary.Scope.AgentSpaceName, summary.InvocationID)
	if err != nil {
		return
	}
	summary.ToolCallCount = len(trace.Tools)
	for _, tool := range trace.Tools {
		summary.RawToolBytes += int64(tool.RawBytes)
		summary.ModelToolBytes += int64(tool.ModelBytes)
		if tool.Status == "error" || tool.Error != "" {
			summary.ErrorCount++
		}
	}
	_ = s.localTraceRepo.SaveInvocationSummary(ctx, *summary)
}

func (s *Service) persistSkillArtifactCandidates(ctx context.Context, agentSpaceName, taskID, stagingDir string, event *adksession.Event) {
	if event == nil || event.Content == nil || strings.TrimSpace(stagingDir) == "" {
		return
	}
	runtime := artifactToolRuntime{
		store:          s.store,
		agentSpaceName: agentSpaceName,
		taskID:         taskID,
		stagingDir:     stagingDir,
	}
	for _, part := range event.Content.Parts {
		if part == nil || part.FunctionResponse == nil || part.FunctionResponse.Name != skills.ExecuteActionToolName {
			continue
		}
		for _, candidate := range artifactCandidatesFromFunctionResponse(part.FunctionResponse.Response) {
			if strings.TrimSpace(candidate.Ref) == "" {
				continue
			}
			_, err := saveArtifactFile(nil, runtime, saveArtifactFileInput{
				Path:        candidate.Ref,
				Name:        candidate.Name,
				MimeType:    candidate.MimeType,
				Description: candidate.Description,
			})
			if err != nil {
				label := firstNonEmpty(candidate.Name, candidate.Ref)
				s.appendTaskStatus(ctx, agentSpaceName, taskID, fmt.Sprintf("Skill 产物保存失败（%s）：%s", label, err))
			}
		}
	}
}

func artifactCandidatesFromFunctionResponse(response any) []skills.ArtifactCandidate {
	output, ok := parseExecuteActionOutputValue(response)
	if !ok {
		return nil
	}
	candidates := append([]skills.ArtifactCandidate{}, output.Artifacts...)
	if output.Output != nil {
		candidates = append(candidates, output.Output.Artifacts...)
	}
	if len(candidates) == 0 {
		return nil
	}
	seen := map[string]bool{}
	deduped := make([]skills.ArtifactCandidate, 0, len(candidates))
	for _, candidate := range candidates {
		key := strings.TrimSpace(candidate.Ref) + "\x00" + strings.TrimSpace(candidate.Name)
		if key == "\x00" || seen[key] {
			continue
		}
		seen[key] = true
		deduped = append(deduped, candidate)
	}
	return deduped
}

func parseExecuteActionOutputValue(response any) (skills.ExecuteActionOutput, bool) {
	var output skills.ExecuteActionOutput
	switch v := response.(type) {
	case skills.ExecuteActionOutput:
		return v, true
	case map[string]any:
		if result, ok := v["result"]; ok {
			response = result
		}
	}
	data, err := json.Marshal(response)
	if err != nil {
		return output, false
	}
	if err := json.Unmarshal(data, &output); err != nil {
		return output, false
	}
	return output, output.Skill != "" || output.Action != "" || output.Output != nil || len(output.Artifacts) > 0
}

func (s *Service) prepareArtifactStagingDir(agentSpaceName, runID string) (string, error) {
	if s.store == nil || strings.TrimSpace(agentSpaceName) == "" || strings.TrimSpace(runID) == "" {
		return "", nil
	}
	dir := filepath.Join(s.store.Root(), agentSpaceName, "tmp", "artifact-staging", store.SafeName(runID))
	abs, err := filepath.Abs(dir)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return "", err
	}
	return abs, nil
}

func cloneEnvVars(values model.EnvVars) model.EnvVars {
	cloned := make(model.EnvVars, len(values)+2)
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

func newGeminiModel(ctx context.Context, cfg model.LLMConfig, env model.EnvVars) (adkmodel.LLM, error) {
	provider := strings.ToLower(strings.TrimSpace(cfg.Provider))
	if provider == "" {
		provider = "gemini"
	}
	if provider != "gemini" && provider != "google" && provider != "google-ai" && provider != "gemini-relay" {
		return nil, fmt.Errorf("unsupported llm provider %q", cfg.Provider)
	}
	modelName := strings.TrimSpace(cfg.Model)
	if modelName == "" {
		modelName = "gemini-2.5-flash"
	}
	clientConfig, err := newGeminiClientConfig(provider, cfg, env)
	if err != nil {
		return nil, err
	}
	return gemini.NewModel(ctx, modelName, clientConfig)
}

func newGeminiClientConfig(provider string, cfg model.LLMConfig, env model.EnvVars) (*genai.ClientConfig, error) {
	if provider == "gemini-relay" {
		apiKey := resolveRelayAPIKey(cfg, env)
		if apiKey == "" {
			return nil, fmt.Errorf("llm apiKey is required for provider %q", provider)
		}
		baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
		if baseURL == "" {
			return nil, fmt.Errorf("llm baseUrl is required for provider %q", provider)
		}
		if strings.HasSuffix(baseURL, "/v1beta") {
			return nil, fmt.Errorf("llm baseUrl for provider %q should be the relay root URL, not include /v1beta", provider)
		}
		return &genai.ClientConfig{
			APIKey:  apiKey,
			Backend: genai.BackendGeminiAPI,
			HTTPOptions: genai.HTTPOptions{
				BaseURL:    baseURL,
				APIVersion: "v1beta",
				Headers: http.Header{
					"Authorization": []string{"Bearer " + apiKey},
				},
			},
		}, nil
	}

	return &genai.ClientConfig{
		APIKey:  resolveNativeGeminiAPIKey(cfg, env),
		Backend: genai.BackendGeminiAPI,
	}, nil
}

func resolveNativeGeminiAPIKey(cfg model.LLMConfig, env model.EnvVars) string {
	if apiKey := strings.TrimSpace(cfg.APIKey); apiKey != "" {
		return apiKey
	}
	if apiKey := strings.TrimSpace(env["GOOGLE_API_KEY"]); apiKey != "" {
		return apiKey
	}
	return strings.TrimSpace(env["GEMINI_API_KEY"])
}

func resolveRelayAPIKey(cfg model.LLMConfig, env model.EnvVars) string {
	if apiKey := strings.TrimSpace(cfg.APIKey); apiKey != "" {
		return apiKey
	}
	for _, key := range []string{"GEMINI_RELAY_API_KEY", "TOKENSTARS_API_KEY", "CC_SWITCH_API_KEY"} {
		if apiKey := strings.TrimSpace(env[key]); apiKey != "" {
			return apiKey
		}
	}
	return ""
}

func (s *Service) appendADKEventRecord(ctx context.Context, turn model.Turn, event *adksession.Event) {
	if event.Content == nil {
		return
	}
	for _, part := range event.Content.Parts {
		record, ok := adkPartToRecord(part, event, event.IsFinalResponse())
		if !ok {
			continue
		}
		record.ID = store.NewRecordID()
		record.AgentSpaceName = turn.AgentSpaceName
		record.ConversationID = turn.ConversationID
		record.TurnID = turn.ID
		record.CreatedAt = time.Now().UTC()
		_ = s.store.AppendConversationRecord(ctx, record)
	}
}

func (s *Service) appendADKTaskEventRecord(ctx context.Context, task model.Task, event *adksession.Event) {
	if event.Content == nil {
		return
	}
	for _, part := range event.Content.Parts {
		record, ok := adkPartToRecord(part, event, event.IsFinalResponse())
		if !ok {
			continue
		}
		record.ID = store.NewRecordID()
		record.AgentSpaceName = task.AgentSpaceName
		record.TaskID = task.ID
		record.CreatedAt = time.Now().UTC()
		_ = s.store.AppendTaskRecord(ctx, record)
	}
}

func adkPartToRecord(part *genai.Part, event *adksession.Event, finalResponse bool) (model.Record, bool) {
	if part == nil {
		return model.Record{}, false
	}
	switch {
	case strings.TrimSpace(part.Text) != "":
		if finalResponse && !part.Thought {
			return model.Record{}, false
		}
		content := strings.TrimSpace(part.Text)
		if !part.Thought && containsToolDetails(content) {
			return model.Record{}, false
		}
		recordType := model.RecordStatus
		if part.Thought {
			recordType = model.RecordThinking
		}
		return model.Record{
			Type:      recordType,
			Content:   content,
			ModelID:   event.ModelVersion,
			CreatedAt: time.Now().UTC(),
		}, true
	case part.FunctionCall != nil:
		return functionCallRecord(part.FunctionCall, event), true
	case part.FunctionResponse != nil:
		record, ok := functionResponseRecord(part.FunctionResponse, event)
		return record, ok
	default:
		return model.Record{}, false
	}
}

func functionCallRecord(call *genai.FunctionCall, event *adksession.Event) model.Record {
	input := jsonString(call.Args)
	if call.Name == "load_skill" {
		return model.Record{
			Type:    model.RecordLoadSkill,
			ModelID: event.ModelVersion,
			LoadSkill: &model.LoadSkill{
				SkillName: stringValue(call.Args, "name"),
				Input:     input,
				ToolUseID: call.ID,
			},
		}
	}
	if call.Name == "list_skills" || call.Name == "load_skill_resource" {
		return model.Record{
			Type:    model.RecordLoadTool,
			ModelID: event.ModelVersion,
			LoadTool: &model.LoadTool{
				ToolName:  call.Name,
				Input:     input,
				ToolUseID: call.ID,
			},
		}
	}
	toolCall := &model.ToolCall{
		Input:     input,
		ToolName:  call.Name,
		ToolUseID: call.ID,
	}
	if call.Name == skills.ExecuteActionToolName {
		if input, ok := parseExecuteActionInput(call.Args); ok {
			toolCall.Skill = input.Skill
			toolCall.Action = input.Action
			toolCall.ToolName = input.Action
		}
	}
	return model.Record{
		Type:     model.RecordToolCall,
		ModelID:  event.ModelVersion,
		ToolCall: toolCall,
	}
}

func functionResponseRecord(response *genai.FunctionResponse, event *adksession.Event) (model.Record, bool) {
	output := jsonString(response.Response)
	if response.Name == "load_skill" {
		return model.Record{
			Type:    model.RecordLoadSkill,
			ModelID: event.ModelVersion,
			LoadSkill: &model.LoadSkill{
				SkillName: firstNonEmpty(stringValue(response.Response, "skill_name"), stringValue(response.Response, "name")),
				Output:    output,
				ToolUseID: response.ID,
			},
		}, true
	}
	if response.Name == "list_skills" || response.Name == "load_skill_resource" {
		return model.Record{
			Type:    model.RecordLoadTool,
			ModelID: event.ModelVersion,
			LoadTool: &model.LoadTool{
				ToolName:  response.Name,
				Output:    output,
				ToolUseID: response.ID,
			},
		}, true
	}
	toolResult := &model.ToolResult{
		Output:    output,
		ToolUseID: response.ID,
		IsError:   false,
	}
	if response.Name == skills.ExecuteActionToolName {
		if output, ok := parseExecuteActionOutput(response.Response); ok {
			toolResult.Skill = output.Skill
			toolResult.Action = output.Action
			toolResult.RawResultRef = output.RawResultRef
		}
	}
	return model.Record{
		Type:       model.RecordToolResult,
		ModelID:    event.ModelVersion,
		ToolResult: toolResult,
	}, true
}

// GetLocalToolTrace resolves a server-generated reference within the owning
// AgentSpace. The repository enforces path containment.
func (s *Service) GetLocalToolTrace(ctx context.Context, agentSpaceName, ref string) (localtrace.ToolRecord, error) {
	if s.localTraceRepo == nil {
		return localtrace.ToolRecord{}, fmt.Errorf("local trace repository is unavailable")
	}
	return s.localTraceRepo.GetToolRecord(ctx, agentSpaceName, ref)
}

func (s *Service) FindInvocationTraces(ctx context.Context, scope localtrace.Scope) ([]localtrace.InvocationTrace, error) {
	if s.localTraceRepo == nil {
		return nil, fmt.Errorf("local trace repository is unavailable")
	}
	return s.localTraceRepo.FindInvocationTraces(ctx, scope)
}

func parseExecuteActionInput(args any) (skills.ExecuteActionInput, bool) {
	var input skills.ExecuteActionInput
	switch v := args.(type) {
	case skills.ExecuteActionInput:
		return v, true
	case map[string]any:
		input.Skill, _ = v["skill"].(string)
		input.Action, _ = v["action"].(string)
		if vars, ok := v["vars"].(map[string]any); ok {
			input.Vars = make(map[string]string, len(vars))
			for key, val := range vars {
				if s, ok := val.(string); ok {
					input.Vars[key] = s
				}
			}
		}
		return input, input.Skill != "" && input.Action != ""
	default:
		return input, false
	}
}

func parseExecuteActionOutput(response any) (skills.ExecuteActionOutput, bool) {
	switch v := response.(type) {
	case skills.ExecuteActionOutput:
		return v, true
	case map[string]any:
		output, _ := parseExecuteActionOutputValue(v)
		return output, output.Skill != "" && output.Action != ""
	default:
		output, ok := parseExecuteActionOutputValue(response)
		return output, ok && output.Skill != "" && output.Action != ""
	}
}

func textFromContent(content *genai.Content) string {
	if content == nil {
		return ""
	}
	var b strings.Builder
	for _, part := range content.Parts {
		if strings.TrimSpace(part.Text) == "" {
			continue
		}
		if part.Thought {
			continue
		}
		if b.Len() > 0 {
			b.WriteString("\n")
		}
		b.WriteString(part.Text)
	}
	return strings.TrimSpace(b.String())
}

func sanitizeFinalText(text string) string {
	result := strings.TrimSpace(text)
	for searchFrom := 0; searchFrom < len(result); {
		lower := strings.ToLower(result)
		relativeStart := strings.Index(lower[searchFrom:], "<details")
		if relativeStart < 0 {
			break
		}
		start := searchFrom + relativeStart
		closeAt := strings.Index(lower[start:], "</details>")
		end := len(result)
		if closeAt >= 0 {
			end = start + closeAt + len("</details>")
		}
		block := lower[start:end]
		if strings.Contains(block, "tool_code") || strings.Contains(block, "tool_result") {
			result = strings.TrimSpace(result[:start] + result[end:])
			searchFrom = start
			continue
		}
		if closeAt < 0 {
			break
		}
		searchFrom = end
	}
	for {
		lower := strings.ToLower(result)
		start := strings.Index(lower, "</details>")
		if start < 0 {
			break
		}
		if strings.Contains(lower[:start], "<details") {
			break
		}
		result = strings.TrimSpace(result[:start] + result[start+len("</details>"):])
	}
	return strings.TrimSpace(result)
}

func containsToolDetails(text string) bool {
	lower := strings.ToLower(text)
	return strings.Contains(lower, "<details") && (strings.Contains(lower, "tool_code") || strings.Contains(lower, "tool_result"))
}

func requiresApproval(instruction string) bool {
	keywords := []string{"重启", "restart", "ssm", "执行命令", "修改配置", "改配置", "删除", "stop", "start service"}
	p := strings.ToLower(instruction)
	for _, keyword := range keywords {
		if strings.Contains(p, strings.ToLower(keyword)) {
			return true
		}
	}
	return false
}

func normalizeTaskSource(source string) (string, error) {
	source = strings.TrimSpace(source)
	if source == "" {
		return model.TaskSourceManual, nil
	}
	switch source {
	case model.TaskSourceChat,
		model.TaskSourceManual,
		model.TaskSourceAutomationOnce,
		model.TaskSourceAutomationSchedule,
		model.TaskSourceAutomationEvent:
		return source, nil
	default:
		return "", fmt.Errorf("unsupported task source %q", source)
	}
}

func (s *Service) updateLinkedTurn(ctx context.Context, task model.Task, response string, status string, updatedAt time.Time) {
	if task.ConversationID == "" || task.TurnID == "" {
		return
	}
	turn, err := s.store.GetTurn(ctx, task.AgentSpaceName, task.ConversationID, task.TurnID)
	if err != nil {
		return
	}
	turn.Status = status
	turn.TaskID = task.ID
	turn.Output = &model.TurnOutput{
		ArtifactIDs: task.Artifacts,
		Text:        response,
	}
	turn.CompletedAt = &updatedAt
	turn.UpdatedAt = updatedAt
	_ = s.store.UpdateTurn(ctx, turn)
	_ = s.store.AppendConversationRecord(ctx, model.Record{
		ID:             store.NewRecordID(),
		AgentSpaceName: task.AgentSpaceName,
		ConversationID: task.ConversationID,
		TurnID:         task.TurnID,
		TaskID:         task.ID,
		Type:           model.RecordResponse,
		Content:        response,
		CreatedAt:      updatedAt,
	})
}

func jsonString(value any) string {
	if value == nil {
		return "{}"
	}
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Sprint(value)
	}
	return string(data)
}

func stringValue(values map[string]any, key string) string {
	if values == nil {
		return ""
	}
	value, _ := values[key].(string)
	return value
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func ptrTime(t time.Time) *time.Time {
	return &t
}
