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

	spaceResp := post(t, handler, "/createAgentSpace", map[string]any{
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

	taskResp := post(t, handler, "/createTask", map[string]any{
		"agentSpaceId": spaceBody.Entity.ID,
		"instruction":  "生成 validator 巡检报告",
	})
	if taskResp.Code != http.StatusAccepted {
		t.Fatalf("createTask status = %d body=%s", taskResp.Code, taskResp.Body.String())
	}
}

func TestUpdateAgentSpaceAPI(t *testing.T) {
	fileStore := store.New(t.TempDir())
	handler := New(fileStore, agent.NewService(fileStore), "").Handler()

	createResp := post(t, handler, "/createAgentSpace", map[string]any{
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

	updateResp := post(t, handler, "/updateAgentSpace", map[string]any{
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

	resp := post(t, handler, "/createAgentSpace", map[string]any{
		"name": "test",
		"environment": map[string]string{
			"BAD-KEY": "value",
		},
	})
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("createAgentSpace status = %d body=%s", resp.Code, resp.Body.String())
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
