package skills

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExecuteActionRunsDeclaredAction(t *testing.T) {
	root := t.TempDir()
	skillDir := filepath.Join(root, "demo-skill")
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatal(err)
	}
	manifest := `version: "1"
actions:
  go_version:
    description: Runs go version.
    readonly: true
    approval: false
    timeoutSeconds: 10
    command: go
    args:
      - version
`
	if err := os.WriteFile(filepath.Join(skillDir, "tools.yaml"), []byte(manifest), 0o644); err != nil {
		t.Fatal(err)
	}

	output, err := ExecuteAction(context.Background(), NewRunner(Config{RootDir: root}), ExecuteActionInput{
		Skill:  "demo-skill",
		Action: "go_version",
	})
	if err != nil {
		t.Fatal(err)
	}
	if output.Skill != "demo-skill" || output.Action != "go_version" {
		t.Fatalf("output skill/action = %s/%s", output.Skill, output.Action)
	}
	if !strings.Contains(output.Stdout, "go version") {
		t.Fatalf("stdout = %q", output.Stdout)
	}
}

func TestNewExecuteActionTool(t *testing.T) {
	tool, err := NewExecuteActionTool(NewRunner(Config{RootDir: t.TempDir()}))
	if err != nil {
		t.Fatal(err)
	}
	if tool.Name() != "execute_skill_action" {
		t.Fatalf("tool name = %q", tool.Name())
	}
	if tool.Description() == "" {
		t.Fatal("tool description is empty")
	}
}
