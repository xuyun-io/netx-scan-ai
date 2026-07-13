package skills

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

func TestBundledSkillActionsAreReadOnly(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", "..", "skills"))
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		skillDir := filepath.Join(root, name)
		if _, err := os.Stat(filepath.Join(skillDir, "tools.yaml")); err != nil {
			continue
		}
		manifest, err := loadManifest(skillDir)
		if err != nil {
			t.Fatalf("%s manifest: %v", name, err)
		}
		for actionName, action := range manifest.Actions {
			if !action.ReadOnly {
				t.Fatalf("%s/%s is not readonly", name, actionName)
			}
			if action.Approval {
				t.Fatalf("%s/%s requires approval", name, actionName)
			}
			if strings.TrimSpace(action.Command) == "" {
				t.Fatalf("%s/%s command is empty", name, actionName)
			}
		}
	}
}

func TestValidatorWindowStatsUsesBatchBlockReads(t *testing.T) {
	var requestCount int32
	var batchCount int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&requestCount, 1)
		var payload any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Errorf("decode RPC request: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		respond := func(request map[string]any) map[string]any {
			method, _ := request["method"].(string)
			result := any("0x")
			switch method {
			case "eth_blockNumber":
				result = "0x3e8" // 1000
			case "eth_getBlockByNumber":
				params, _ := request["params"].([]any)
				number, _ := params[0].(string)
				var blockNumber int64
				_, _ = fmt.Sscanf(number, "0x%x", &blockNumber)
				result = map[string]any{
					"timestamp":    fmt.Sprintf("0x%x", blockNumber*3),
					"miner":        "0x1111111111111111111111111111111111111111",
					"gasUsed":      "0x0",
					"transactions": []any{},
				}
			}
			return map[string]any{"jsonrpc": "2.0", "id": request["id"], "result": result}
		}

		w.Header().Set("Content-Type", "application/json")
		switch value := payload.(type) {
		case []any:
			atomic.AddInt32(&batchCount, 1)
			responses := make([]map[string]any, 0, len(value))
			// Return responses in reverse order to verify ID-based correlation.
			for index := len(value) - 1; index >= 0; index-- {
				responses = append(responses, respond(value[index].(map[string]any)))
			}
			_ = json.NewEncoder(w).Encode(responses)
		case map[string]any:
			_ = json.NewEncoder(w).Encode(respond(value))
		}
	}))
	defer server.Close()

	root := filepath.Clean(filepath.Join("..", "..", "skills"))
	result, err := NewRunner(Config{RootDir: root}).RunWithEnv(
		context.Background(),
		"chain287-validator-health",
		"validator_window_stats",
		nil,
		map[string]string{"CHAIN287_RPC_URL": server.URL},
	)
	if err != nil {
		t.Fatal(err)
	}
	if result.Output == nil || result.Output.Data == nil {
		t.Fatalf("result = %+v", result)
	}
	if atomic.LoadInt32(&batchCount) < 2 {
		t.Fatalf("batch requests = %d", batchCount)
	}
	if atomic.LoadInt32(&requestCount) >= 30 {
		t.Fatalf("RPC requests = %d, expected binary lookup plus batched reads", requestCount)
	}
}

func TestBundledReportSkillLoadsLocalTraceReference(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", "..", "skills"))
	staging := t.TempDir()
	traceRoot := t.TempDir()
	invocationID := "inv-report-test"
	toolsDir := filepath.Join(traceRoot, invocationID, "tools")
	if err := os.MkdirAll(toolsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	required := [][2]string{
		{"chain287-chain-query", "rpc_snapshot"}, {"chain287-chain-query", "chain_health"},
		{"chain287-chain-query", "recent_blocks"}, {"chain287-chain-query", "active_validators"},
		{"chain287-validator-health", "validator_overview"}, {"chain287-validator-health", "validator_block_stats"},
		{"chain287-validator-health", "validator_rewards"}, {"chain287-validator-health", "validator_jailed_status"},
		{"chain287-validator-health", "validator_window_stats"},
	}
	for index, item := range required {
		record := map[string]any{"response": map[string]any{
			"skill": item[0], "action": item[1],
			"output": map[string]any{"version": "1.0", "status": "ok", "message": "real check", "data": map[string]any{}},
		}}
		data, err := json.Marshal(record)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(toolsDir, fmt.Sprintf("call-%d.json", index)), data, 0o600); err != nil {
			t.Fatal(err)
		}
	}

	result, err := NewRunner(Config{RootDir: root}).RunWithEnv(
		context.Background(),
		"chain287-sre-inspection-report",
		"render_report",
		map[string]string{
			"report_ref":   invocationID,
			"report_title": "Trace-based report",
		},
		map[string]string{
			"NETX_ARTIFACT_DIR":    staging,
			"NETX_LOCAL_TRACE_DIR": traceRoot,
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if result.Output == nil || len(result.Artifacts) != 1 {
		t.Fatalf("result = %+v", result)
	}
	if _, err := os.Stat(filepath.Join(staging, result.Artifacts[0].Ref)); err != nil {
		t.Fatalf("trace-based report was not written: %v", err)
	}
}

func TestBundledReportSkillRejectsIncompleteInspection(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", "..", "skills"))
	staging := t.TempDir()
	traceRoot := t.TempDir()
	invocationID := "inv-incomplete-report"
	toolsDir := filepath.Join(traceRoot, invocationID, "tools")
	if err := os.MkdirAll(toolsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	record := map[string]any{"response": map[string]any{
		"skill": "chain287-chain-query", "action": "rpc_snapshot",
		"output": map[string]any{"version": "1.0", "status": "ok", "message": "real check", "data": map[string]any{}},
	}}
	data, err := json.Marshal(record)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(toolsDir, "call-1.json"), data, 0o600); err != nil {
		t.Fatal(err)
	}
	result, err := NewRunner(Config{RootDir: root}).RunWithEnv(
		context.Background(), "chain287-sre-inspection-report", "render_report",
		map[string]string{"report_ref": invocationID},
		map[string]string{"NETX_ARTIFACT_DIR": staging, "NETX_LOCAL_TRACE_DIR": traceRoot},
	)
	if err != nil {
		t.Fatal(err)
	}
	if result.Output == nil || result.Output.Status != "error" || len(result.Artifacts) != 0 {
		t.Fatalf("incomplete report result = %+v", result)
	}
	if !strings.Contains(result.Output.Message, "active_validators") || !strings.Contains(result.Output.Message, "validator_window_stats") {
		t.Fatalf("missing action detail = %q", result.Output.Message)
	}
}

func TestBundledSkillScriptsDoNotContainWriteOps(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", "..", "skills"))
	banned := []string{
		"cast send",
		"--private-key",
		"privatekey.txt",
		"keystore",
		"aws ssm",
		"docker stop",
		"docker compose stop",
		"docker-compose stop",
		"docker restart",
		"docker compose up",
		"docker-compose up",
	}

	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sh") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		lower := strings.ToLower(string(data))
		for _, token := range banned {
			if strings.Contains(lower, token) {
				t.Fatalf("%s contains banned write operation marker %q", path, token)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestBundledReportSkillDoesNotExposeSampleReport(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", "..", "skills"))
	_, err := NewRunner(Config{RootDir: root}).RunWithEnv(
		context.Background(),
		"chain287-sre-inspection-report",
		"sample_report",
		nil,
		nil,
	)
	if err == nil {
		t.Fatal("sample_report must not be exposed")
	}
}
