package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/agent"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/model"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/store"
)

func TestCreateAgentSpaceAndTaskAPI(t *testing.T) {
	fileStore := store.New(t.TempDir())
	handler := New(fileStore, agent.NewService(fileStore), "").Handler()

	spaceResp := post(t, handler, "/api/v1/createAgentSpace", map[string]any{
		"name": "test",
		"environment": map[string]string{
			"GOOGLE_API_KEY":   "space-key",
			"CHAIN287_RPC_URL": "https://rpc.chain287.example",
		},
	})
	if spaceResp.Code != http.StatusOK {
		t.Fatalf("createAgentSpace status = %d body=%s", spaceResp.Code, spaceResp.Body.String())
	}
	var spaceBody struct {
		Entity model.AgentSpace `json:"entity"`
	}
	if err := json.Unmarshal(spaceResp.Body.Bytes(), &spaceBody); err != nil {
		t.Fatal(err)
	}
	if spaceBody.Entity.Environment["GOOGLE_API_KEY"] != "space-key" {
		t.Fatalf("environment GOOGLE_API_KEY = %q", spaceBody.Entity.Environment["GOOGLE_API_KEY"])
	}

	taskResp := post(t, handler, "/api/v1/createTask", map[string]any{
		"agentSpaceId":     spaceBody.Entity.ID,
		"instruction":      "生成 validator 巡检报告",
		"requiresApproval": true,
		"preAuthorized":    false,
	})
	if taskResp.Code != http.StatusAccepted {
		t.Fatalf("createTask status = %d body=%s", taskResp.Code, taskResp.Body.String())
	}
}

func TestUpdateAgentSpaceAPI(t *testing.T) {
	fileStore := store.New(t.TempDir())
	handler := New(fileStore, agent.NewService(fileStore), "").Handler()

	createResp := post(t, handler, "/api/v1/createAgentSpace", map[string]any{
		"name": "test",
		"environment": map[string]string{
			"OLD_KEY": "old-value",
		},
	})
	if createResp.Code != http.StatusOK {
		t.Fatalf("createAgentSpace status = %d body=%s", createResp.Code, createResp.Body.String())
	}
	var createBody struct {
		Entity model.AgentSpace `json:"entity"`
	}
	if err := json.Unmarshal(createResp.Body.Bytes(), &createBody); err != nil {
		t.Fatal(err)
	}

	updateResp := post(t, handler, "/api/v1/updateAgentSpace", map[string]any{
		"agentSpaceId": createBody.Entity.ID,
		"environment": map[string]string{
			"NEW_KEY": "new-value",
		},
	})
	if updateResp.Code != http.StatusOK {
		t.Fatalf("updateAgentSpace status = %d body=%s", updateResp.Code, updateResp.Body.String())
	}
	var updateBody struct {
		Entity model.AgentSpace `json:"entity"`
	}
	if err := json.Unmarshal(updateResp.Body.Bytes(), &updateBody); err != nil {
		t.Fatal(err)
	}
	if updateBody.Entity.Environment["NEW_KEY"] != "new-value" {
		t.Fatalf("environment NEW_KEY = %q", updateBody.Entity.Environment["NEW_KEY"])
	}
	if _, exists := updateBody.Entity.Environment["OLD_KEY"]; exists {
		t.Fatal("OLD_KEY should have been replaced")
	}
}

func TestCreateAgentSpaceRejectsInvalidEnvironmentKey(t *testing.T) {
	fileStore := store.New(t.TempDir())
	handler := New(fileStore, agent.NewService(fileStore), "").Handler()

	resp := post(t, handler, "/api/v1/createAgentSpace", map[string]any{
		"name": "test",
		"environment": map[string]string{
			"BAD-KEY": "value",
		},
	})
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("createAgentSpace status = %d body=%s", resp.Code, resp.Body.String())
	}
}

func TestTurnAndRecordAPIUseFinOpsRoots(t *testing.T) {
	ctx := t.Context()
	fileStore := store.New(t.TempDir())
	handler := New(fileStore, agent.NewService(fileStore), "").Handler()
	space, err := fileStore.CreateAgentSpace(ctx, model.AgentSpace{Name: "test"})
	if err != nil {
		t.Fatal(err)
	}
	conversation, err := fileStore.CreateConversation(ctx, space.ID, "test")
	if err != nil {
		t.Fatal(err)
	}
	turn := model.Turn{
		ID:             store.NewTurnID(),
		AgentSpaceID:   space.ID,
		ConversationID: conversation.ID,
		Status:         model.StatusSuccess,
		Prompt:         "hello",
		DocumentIDs:    []string{},
		Output:         &model.TurnOutput{ArtifactIDs: []string{}, Text: "hi"},
		CreatedAt:      conversation.CreatedAt,
		UpdatedAt:      conversation.UpdatedAt,
	}
	if err := fileStore.AppendTurn(ctx, turn); err != nil {
		t.Fatal(err)
	}
	if err := fileStore.AppendConversationRecord(ctx, model.Record{
		AgentSpaceID:   space.ID,
		ConversationID: conversation.ID,
		TurnID:         turn.ID,
		Type:           model.RecordResponse,
		Content:        "hi",
	}); err != nil {
		t.Fatal(err)
	}

	turnResp := post(t, handler, "/api/v1/getTurn", map[string]any{
		"agentSpaceId":   space.ID,
		"conversationId": conversation.ID,
		"turnId":         turn.ID,
	})
	if turnResp.Code != http.StatusOK {
		t.Fatalf("getTurn status = %d body=%s", turnResp.Code, turnResp.Body.String())
	}
	var turnBody struct {
		Turn model.Turn `json:"turn"`
	}
	if err := json.Unmarshal(turnResp.Body.Bytes(), &turnBody); err != nil {
		t.Fatal(err)
	}
	if turnBody.Turn.ID != turn.ID || turnBody.Turn.Output == nil || turnBody.Turn.Output.Text != "hi" {
		t.Fatalf("turn body = %+v", turnBody.Turn)
	}

	recordsResp := post(t, handler, "/api/v1/listRecords", map[string]any{
		"agentSpaceId":   space.ID,
		"conversationId": conversation.ID,
		"turnId":         turn.ID,
	})
	if recordsResp.Code != http.StatusOK {
		t.Fatalf("listRecords status = %d body=%s", recordsResp.Code, recordsResp.Body.String())
	}
	var recordsBody struct {
		Records []model.Record `json:"records"`
	}
	if err := json.Unmarshal(recordsResp.Body.Bytes(), &recordsBody); err != nil {
		t.Fatal(err)
	}
	if len(recordsBody.Records) != 1 || recordsBody.Records[0].Type != model.RecordResponse {
		t.Fatalf("records body = %+v", recordsBody.Records)
	}
}

func post(t *testing.T, handler http.Handler, path string, body map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	data, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}
