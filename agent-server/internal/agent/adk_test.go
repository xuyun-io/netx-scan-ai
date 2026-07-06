package agent

import (
	"context"
	"iter"
	"os"
	"path/filepath"
	"testing"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/model"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/skills"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/store"
	adkmodel "google.golang.org/adk/v2/model"
	adksession "google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/tool/skilltoolset/skill"
	"google.golang.org/genai"
)

func TestADKSkillSourceLoadsBundledSkills(t *testing.T) {
	source := skill.NewFileSystemSource(os.DirFS(filepath.Join("..", "..", "skills")))
	frontmatters, err := source.ListFrontmatters(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	for _, frontmatter := range frontmatters {
		if frontmatter.Name == "chain287-chain-query" {
			return
		}
	}
	t.Fatalf("chain287-chain-query skill not found in %v", frontmatters)
}

func TestServiceInitializesADKSkillTools(t *testing.T) {
	service := NewService(store.New(t.TempDir()))
	if service.skillToolset == nil {
		t.Fatal("skill toolset is nil")
	}
	if service.skillActionTool == nil {
		t.Fatal("skill action tool is nil")
	}
	if service.skillActionTool.Name() != "execute_skill_action" {
		t.Fatalf("skill action tool = %q", service.skillActionTool.Name())
	}
}

func TestProcessTurnUsesADKModel(t *testing.T) {
	ctx := context.Background()
	fileStore := store.New(t.TempDir())
	space, err := fileStore.CreateAgentSpace(ctx, model.AgentSpace{
		Name: "test",
		Environment: model.EnvVars{
			"GOOGLE_API_KEY":     "space-key",
			"CHAIN287_RPC_URL":   "https://rpc.chain287.example",
			"NETX_AGENT_PROFILE": "sre",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	conversation, err := fileStore.CreateConversation(ctx, space.ID, "test")
	if err != nil {
		t.Fatal(err)
	}
	service := NewService(fileStore)
	var capturedEnv model.EnvVars
	service.modelFactory = func(_ context.Context, _ model.LLMConfig, env model.EnvVars) (adkmodel.LLM, error) {
		capturedEnv = env
		return &singleResponseModel{text: "mock model response"}, nil
	}
	turn := model.Turn{
		ID:             store.NewTurnID(),
		ConversationID: conversation.ID,
		AgentSpaceID:   space.ID,
		Status:         model.StatusInProgress,
		Prompt:         "test",
		CreatedAt:      conversation.CreatedAt,
		UpdatedAt:      conversation.CreatedAt,
	}
	if err := fileStore.AppendTurn(ctx, turn); err != nil {
		t.Fatal(err)
	}

	service.processTurn(turn)

	updated, err := fileStore.GetTurn(ctx, space.ID, conversation.ID, turn.ID)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Status != model.StatusSuccess {
		t.Fatalf("status = %s", updated.Status)
	}
	if updated.Output == nil || updated.Output.Text != "mock model response" {
		t.Fatalf("output = %+v", updated.Output)
	}
	if capturedEnv["GOOGLE_API_KEY"] != "space-key" {
		t.Fatalf("model env GOOGLE_API_KEY = %q", capturedEnv["GOOGLE_API_KEY"])
	}
	if capturedEnv["CHAIN287_RPC_URL"] != "https://rpc.chain287.example" {
		t.Fatalf("model env CHAIN287_RPC_URL = %q", capturedEnv["CHAIN287_RPC_URL"])
	}

	records, err := fileStore.ListRecords(ctx, space.ID, "", conversation.ID, turn.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 1 || records[0].Type != model.RecordResponse || records[0].Content != "mock model response" {
		t.Fatalf("records = %+v", records)
	}
}

func TestADKPartToRecordStructuresSkillActionTool(t *testing.T) {
	event := &adksession.Event{LLMResponse: adkmodel.LLMResponse{ModelVersion: "mock-model"}}
	callRecord, ok := adkPartToRecord(&genai.Part{
		FunctionCall: &genai.FunctionCall{
			ID:   "tool-1",
			Name: skills.ExecuteActionToolName,
			Args: map[string]any{
				"skill":  "chain287-chain-query",
				"action": "latest_block",
			},
		},
	}, event, false)
	if !ok {
		t.Fatal("tool call record not created")
	}
	if callRecord.Type != model.RecordToolCall || callRecord.ToolCall == nil {
		t.Fatalf("call record = %+v", callRecord)
	}
	if callRecord.ToolCall.ToolName != "latest_block" || callRecord.ToolCall.Skill != "chain287-chain-query" {
		t.Fatalf("tool call = %+v", callRecord.ToolCall)
	}

	resultRecord, ok := adkPartToRecord(&genai.Part{
		FunctionResponse: &genai.FunctionResponse{
			ID:   "tool-1",
			Name: skills.ExecuteActionToolName,
			Response: map[string]any{
				"skill":    "chain287-chain-query",
				"action":   "latest_block",
				"exitCode": 0,
			},
		},
	}, event, false)
	if !ok {
		t.Fatal("tool result record not created")
	}
	if resultRecord.Type != model.RecordToolResult || resultRecord.ToolResult == nil {
		t.Fatalf("result record = %+v", resultRecord)
	}
	if resultRecord.ToolResult.ToolUseID != "tool-1" || resultRecord.ToolResult.Skill != "chain287-chain-query" {
		t.Fatalf("tool result = %+v", resultRecord.ToolResult)
	}
}

func TestSanitizeFinalTextRemovesToolDetails(t *testing.T) {
	input := "最新块高是 315689。\n\n<details> <summary>tool_code</summary>\nCalled tool latest_block\n</details>"
	if got := sanitizeFinalText(input); got != "最新块高是 315689。" {
		t.Fatalf("sanitizeFinalText() = %q", got)
	}

	malformed := "最新块高是 315689。 <details> <summary>tool_code</summary>"
	if got := sanitizeFinalText(malformed); got != "最新块高是 315689。" {
		t.Fatalf("sanitizeFinalText(malformed) = %q", got)
	}
}

func TestADKPartToRecordSkipsToolDetailStatusText(t *testing.T) {
	event := &adksession.Event{LLMResponse: adkmodel.LLMResponse{ModelVersion: "mock-model"}}
	_, ok := adkPartToRecord(&genai.Part{
		Text: "最新块高是 315689。 <details> <summary>tool_code</summary>",
	}, event, false)
	if ok {
		t.Fatal("tool detail status text should be skipped")
	}
}

type singleResponseModel struct {
	text string
}

func (m *singleResponseModel) Name() string {
	return "mock"
}

func (m *singleResponseModel) GenerateContent(context.Context, *adkmodel.LLMRequest, bool) iter.Seq2[*adkmodel.LLMResponse, error] {
	return func(yield func(*adkmodel.LLMResponse, error) bool) {
		yield(&adkmodel.LLMResponse{
			Content: genai.NewContentFromText(m.text, genai.RoleModel),
		}, nil)
	}
}
