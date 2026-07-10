package skills

import (
	"context"
	"os"
	"path/filepath"
	"strings"
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

func TestBundledReportSkillGeneratesHTMLArtifact(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", "..", "skills"))
	staging := t.TempDir()
	result, err := NewRunner(Config{RootDir: root}).RunWithEnv(
		context.Background(),
		"chain287-sre-inspection-report",
		"sample_report",
		map[string]string{
			"report_title": "Chain287 SRE 巡检报告",
			"report_scope": "Chain287 / validator / RPC",
		},
		map[string]string{
			"NETX_ARTIFACT_DIR": staging,
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if result.Output == nil {
		t.Fatal("output is nil")
	}
	if len(result.Artifacts) != 1 {
		t.Fatalf("artifacts = %#v", result.Artifacts)
	}
	artifact := result.Artifacts[0]
	if filepath.Ext(artifact.Name) != ".html" || artifact.MimeType != "text/html" {
		t.Fatalf("artifact = %+v", artifact)
	}
	if _, err := os.Stat(filepath.Join(staging, artifact.Ref)); err != nil {
		t.Fatalf("artifact file was not written: %v", err)
	}
}
