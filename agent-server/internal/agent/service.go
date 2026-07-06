package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/model"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/skills"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/store"
	"google.golang.org/adk/v2/agent"
	adkmodel "google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/model/gemini"
	"google.golang.org/adk/v2/runner"
	adksession "google.golang.org/adk/v2/session"
	adktool "google.golang.org/adk/v2/tool"
	"google.golang.org/genai"
)

type Service struct {
	store           *store.Store
	skillRunner     *skills.Runner
	skillToolset    *ADKSkillToolset
	skillActionTool adktool.Tool
	sessionService  adksession.Service
	modelFactory    func(context.Context, model.LLMConfig, model.EnvVars) (adkmodel.LLM, error)
}

func NewService(store *store.Store) *Service {
	runner := skills.NewRunner(skills.Config{})
	toolset, _ := NewADKSkillToolset(context.Background(), runner.RootDir())
	actionTool, _ := skills.NewExecuteActionTool(runner)
	return &Service{
		store:           store,
		skillRunner:     runner,
		skillToolset:    toolset,
		skillActionTool: actionTool,
		sessionService:  adksession.InMemoryService(),
		modelFactory:    newGeminiModel,
	}
}

func (s *Service) CreateTurn(ctx context.Context, agentSpaceID, conversationID, prompt string) (model.Turn, error) {
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
		AgentSpaceID:   agentSpaceID,
		Status:         model.StatusInProgress,
		Prompt:         prompt,
		DocumentIDs:    []string{},
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if err := s.store.AppendTurn(ctx, turn); err != nil {
		return model.Turn{}, err
	}
	go s.processTurn(turn)
	return turn, nil
}

func (s *Service) CreateTask(ctx context.Context, task model.Task) (model.Task, error) {
	task.Instruction = strings.TrimSpace(task.Instruction)
	if task.Instruction == "" {
		return model.Task{}, fmt.Errorf("instruction is required")
	}
	if task.AgentSpaceID == "" {
		return model.Task{}, fmt.Errorf("agentSpaceId is required")
	}
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
		ID:           store.NewRecordID(),
		AgentSpaceID: created.AgentSpaceID,
		TaskID:       created.ID,
		Type:         model.RecordStatus,
		Content:      fmt.Sprintf("任务已创建，当前状态：%s", created.Status),
		CreatedAt:    time.Now().UTC(),
	})
	if created.Status != model.StatusAwaitingInput {
		go s.ExecuteTask(created.AgentSpaceID, created.ID)
	}
	return created, nil
}

func (s *Service) RespondToTask(ctx context.Context, agentSpaceID, taskID, response, userID string) (model.Task, error) {
	task, err := s.store.GetTask(ctx, agentSpaceID, taskID)
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
			ID:           store.NewRecordID(),
			AgentSpaceID: agentSpaceID,
			TaskID:       taskID,
			Type:         model.RecordStatus,
			Content:      "审批已拒绝，任务结束。",
			CreatedAt:    time.Now().UTC(),
		})
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
		ID:           store.NewRecordID(),
		AgentSpaceID: agentSpaceID,
		TaskID:       taskID,
		Type:         model.RecordStatus,
		Content:      "审批已通过，任务继续执行。",
		CreatedAt:    now,
	})
	go s.ExecuteTask(agentSpaceID, taskID)
	return task, nil
}

func (s *Service) ExecuteTask(agentSpaceID, taskID string) {
	ctx := context.Background()
	task, err := s.store.GetTask(ctx, agentSpaceID, taskID)
	if err != nil {
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
		ID:           store.NewRecordID(),
		AgentSpaceID: agentSpaceID,
		TaskID:       taskID,
		Type:         model.RecordStatus,
		Content:      "任务开始执行。",
		CreatedAt:    now,
	})
	response, err := s.runADKTask(ctx, task)
	if err != nil {
		completedAt := time.Now().UTC()
		task.Status = model.StatusFailed
		task.CompletedAt = &completedAt
		task.Output = map[string]string{"error": err.Error()}
		_ = s.store.UpdateTask(ctx, task)
		_ = s.store.AppendTaskRecord(ctx, model.Record{
			ID:           store.NewRecordID(),
			AgentSpaceID: agentSpaceID,
			TaskID:       taskID,
			Type:         model.RecordError,
			Content:      err.Error(),
			CreatedAt:    completedAt,
		})
		s.updateLinkedTurn(ctx, task, err.Error(), model.StatusFailed, completedAt)
		return
	}
	result := renderADKTaskArtifact(task, response)
	artifact, err := s.store.CreateArtifact(ctx, model.Artifact{
		AgentSpaceID: agentSpaceID,
		TaskID:       taskID,
		Name:         fmt.Sprintf("%s-result.md", task.ID),
		Type:         "Markdown",
	}, []byte(result))
	if err == nil {
		task.Artifacts = append(task.Artifacts, artifact.ID)
	}
	_ = s.store.AppendTaskRecord(ctx, model.Record{
		ID:           store.NewRecordID(),
		AgentSpaceID: agentSpaceID,
		TaskID:       taskID,
		Type:         model.RecordToolResult,
		Content:      "已生成第一版 Markdown 执行结果 artifact。",
		CreatedAt:    time.Now().UTC(),
	})
	completedAt := time.Now().UTC()
	task.Status = model.StatusCompleted
	task.CompletedAt = &completedAt
	task.Output = map[string]string{
		"summary": response,
	}
	_ = s.store.UpdateTask(ctx, task)
	_ = s.store.AppendTaskRecord(ctx, model.Record{
		ID:           store.NewRecordID(),
		AgentSpaceID: agentSpaceID,
		TaskID:       taskID,
		Type:         model.RecordResponse,
		Content:      task.Output["summary"],
		CreatedAt:    completedAt,
	})
	if task.ConversationID != "" && task.TurnID != "" {
		s.updateLinkedTurn(ctx, task, response, model.StatusSuccess, completedAt)
	}
}

func (s *Service) processTurn(turn model.Turn) {
	ctx := context.Background()
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
			AgentSpaceID:   turn.AgentSpaceID,
			ConversationID: turn.ConversationID,
			TurnID:         turn.ID,
			Type:           model.RecordError,
			Content:        err.Error(),
			CreatedAt:      turn.UpdatedAt,
		})
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
		AgentSpaceID:   turn.AgentSpaceID,
		ConversationID: turn.ConversationID,
		TurnID:         turn.ID,
		Type:           model.RecordResponse,
		Content:        response,
		CreatedAt:      turn.UpdatedAt,
	})
}

func (s *Service) runADKTurn(ctx context.Context, turn model.Turn) (string, error) {
	return s.runADKPrompt(ctx, turn.AgentSpaceID, turn.ConversationID, turn.Prompt, func(event *adksession.Event) {
		s.appendADKEventRecord(ctx, turn, event)
	})
}

func (s *Service) runADKTask(ctx context.Context, task model.Task) (string, error) {
	sessionID := task.ID
	if task.ConversationID != "" {
		sessionID = task.ConversationID
	}
	return s.runADKPrompt(ctx, task.AgentSpaceID, sessionID, task.Instruction, func(event *adksession.Event) {
		s.appendADKTaskEventRecord(ctx, task, event)
	})
}

func (s *Service) runADKPrompt(ctx context.Context, agentSpaceID, sessionID, prompt string, recordEvent func(*adksession.Event)) (string, error) {
	space, err := s.store.GetAgentSpace(ctx, agentSpaceID)
	if err != nil {
		return "", fmt.Errorf("load agent space: %w", err)
	}
	llm, err := s.modelFactory(ctx, space.LLM, space.Environment)
	if err != nil {
		return "", fmt.Errorf("create ADK model: %w", err)
	}
	adkAgent, err := NewADKChainAgentWithEnv(ctx, llm, s.skillRunner.RootDir(), s.skillRunner, space.Environment)
	if err != nil {
		return "", fmt.Errorf("create ADK agent: %w", err)
	}
	adkRunner, err := runner.New(runner.Config{
		AppName:           "netx-chain287",
		Agent:             adkAgent,
		SessionService:    s.sessionService,
		AutoCreateSession: true,
	})
	if err != nil {
		return "", fmt.Errorf("create ADK runner: %w", err)
	}

	content := genai.NewContentFromText(prompt, genai.RoleUser)
	var finalText string
	for event, err := range adkRunner.Run(ctx, agentSpaceID, sessionID, content, agent.RunConfig{
		StreamingMode: agent.StreamingModeNone,
	}) {
		if err != nil {
			return "", fmt.Errorf("run ADK agent: %w", err)
		}
		if event == nil {
			continue
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
		return "", fmt.Errorf("ADK agent produced no final text")
	}
	return finalText, nil
}

func newGeminiModel(ctx context.Context, cfg model.LLMConfig, env model.EnvVars) (adkmodel.LLM, error) {
	provider := strings.ToLower(strings.TrimSpace(cfg.Provider))
	if provider != "" && provider != "gemini" && provider != "google" && provider != "google-ai" {
		return nil, fmt.Errorf("unsupported llm provider %q", cfg.Provider)
	}
	modelName := strings.TrimSpace(cfg.Model)
	if modelName == "" {
		modelName = "gemini-2.5-flash"
	}
	apiKey := strings.TrimSpace(cfg.APIKey)
	if apiKey == "" {
		apiKey = strings.TrimSpace(env["GOOGLE_API_KEY"])
	}
	if apiKey == "" {
		apiKey = strings.TrimSpace(env["GEMINI_API_KEY"])
	}
	clientConfig := &genai.ClientConfig{APIKey: apiKey}
	return gemini.NewModel(ctx, modelName, clientConfig)
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
		record.AgentSpaceID = turn.AgentSpaceID
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
		record.AgentSpaceID = task.AgentSpaceID
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
		}
	}
	return model.Record{
		Type:       model.RecordToolResult,
		ModelID:    event.ModelVersion,
		ToolResult: toolResult,
	}, true
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
	var output skills.ExecuteActionOutput
	switch v := response.(type) {
	case skills.ExecuteActionOutput:
		return v, true
	case map[string]any:
		if result, ok := v["result"].(map[string]any); ok {
			v = result
		}
		output.Skill, _ = v["skill"].(string)
		output.Action, _ = v["action"].(string)
		output.Description, _ = v["description"].(string)
		output.Command, _ = v["command"].(string)
		if ro, ok := v["readonly"].(bool); ok {
			output.ReadOnly = ro
		}
		if ap, ok := v["approval"].(bool); ok {
			output.Approval = ap
		}
		return output, output.Skill != "" && output.Action != ""
	default:
		return output, false
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

func (s *Service) updateLinkedTurn(ctx context.Context, task model.Task, response string, status string, updatedAt time.Time) {
	if task.ConversationID == "" || task.TurnID == "" {
		return
	}
	turn, err := s.store.GetTurn(ctx, task.AgentSpaceID, task.ConversationID, task.TurnID)
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
		AgentSpaceID:   task.AgentSpaceID,
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

func renderADKTaskArtifact(task model.Task, response string) string {
	return fmt.Sprintf(`# %s

## 指令

%s

## Agent Response

%s
`, task.Name, task.Instruction, response)
}

func ptrTime(t time.Time) *time.Time {
	return &t
}
