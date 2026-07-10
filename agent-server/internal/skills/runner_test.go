package skills

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunnerExecutesManifestAction(t *testing.T) {
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

	result, err := NewRunner(Config{RootDir: root}).Run(context.Background(), "demo-skill", "go_version", nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.ExitCode != 0 {
		t.Fatalf("exit code = %d", result.ExitCode)
	}
	if !strings.Contains(result.Stdout, "go version") {
		t.Fatalf("stdout = %q", result.Stdout)
	}
}

func TestRunnerInjectsExtraEnvironment(t *testing.T) {
	root := t.TempDir()
	skillDir := filepath.Join(root, "demo-skill")
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatal(err)
	}
	manifest := `version: "1"
actions:
  read_env:
    description: Reads injected environment.
    readonly: true
    approval: false
    timeoutSeconds: 10
    command: go
    args:
      - run
      - ./envprint.go
`
	if err := os.WriteFile(filepath.Join(skillDir, "tools.yaml"), []byte(manifest), 0o644); err != nil {
		t.Fatal(err)
	}
	program := `package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Print(os.Getenv("NETX_TEST_ENV"))
}
`
	if err := os.WriteFile(filepath.Join(skillDir, "envprint.go"), []byte(program), 0o644); err != nil {
		t.Fatal(err)
	}

	result, err := NewRunner(Config{RootDir: root}).RunWithEnv(context.Background(), "demo-skill", "read_env", nil, map[string]string{
		"NETX_TEST_ENV": "skill-env-ok",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Stdout != "skill-env-ok" {
		t.Fatalf("stdout = %q", result.Stdout)
	}
}

func TestRunnerRejectsNonReadOnlyAction(t *testing.T) {
	root := t.TempDir()
	skillDir := filepath.Join(root, "demo-skill")
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		t.Fatal(err)
	}
	manifest := `version: "1"
actions:
  mutate:
    description: Should not run.
    readonly: false
    approval: false
    timeoutSeconds: 10
    command: go
    args:
      - version
`
	if err := os.WriteFile(filepath.Join(skillDir, "tools.yaml"), []byte(manifest), 0o644); err != nil {
		t.Fatal(err)
	}

	_, err := NewRunner(Config{RootDir: root}).Run(context.Background(), "demo-skill", "mutate", nil)
	if err == nil {
		t.Fatal("expected non-readonly action to be rejected")
	}
	if !strings.Contains(err.Error(), "not marked readonly") {
		t.Fatalf("error = %q", err)
	}
}

func TestPrepareCommandUsesInterpreterForScripts(t *testing.T) {
	command, args, err := prepareCommand(t.TempDir(), action{
		Command: "scripts/example.sh",
		Args:    []string{"latest_block"},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if command != "sh" {
		t.Fatalf("command = %q, want sh", command)
	}
	if got := args[len(args)-1]; got != "latest_block" {
		t.Fatalf("last arg = %q", got)
	}
}
