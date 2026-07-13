package localtrace

import "testing"

func TestProjectForModelRemovesDuplicatedRawFields(t *testing.T) {
	output := map[string]any{
		"skill":       "chain287-chain-query",
		"action":      "rpc_snapshot",
		"stdout":      `{"status":"ok"}`,
		"stderr":      "debug",
		"command":     "scripts/chain-rpc.sh",
		"description": "snapshot",
		"readonly":    true,
		"approval":    false,
		"output": map[string]any{
			"version": "1.0",
			"status":  "ok",
			"message": "healthy",
		},
		"exitCode": 0,
	}
	got := ProjectForModel(output, "inv/tools/call.json")
	for _, key := range []string{"stdout", "stderr", "command", "description", "readonly", "approval"} {
		if _, ok := got[key]; ok {
			t.Fatalf("field %q should not be exposed to model", key)
		}
	}
	if got["output"] == nil || got["rawResultRef"] != "inv/tools/call.json" {
		t.Fatalf("projection = %+v", got)
	}
	if _, ok := output["stdout"]; !ok {
		t.Fatal("projection mutated original result")
	}
}
