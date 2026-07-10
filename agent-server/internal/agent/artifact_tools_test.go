package agent

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/model"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/skills"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/store"
	adkmodel "google.golang.org/adk/v2/model"
	adksession "google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

func TestSaveArtifactBytesLinksTask(t *testing.T) {
	ctx := context.Background()
	fileStore := store.New(t.TempDir())
	space, err := fileStore.CreateAgentSpace(ctx, model.AgentSpace{Name: "test"})
	if err != nil {
		t.Fatal(err)
	}
	task, err := fileStore.CreateTask(ctx, model.Task{
		AgentSpaceName: space.Name,
		Instruction:  "collect report",
		Status:       model.StatusInProgress,
	})
	if err != nil {
		t.Fatal(err)
	}

	output, err := saveArtifactBytes(nil, artifactToolRuntime{
		store:        fileStore,
		agentSpaceName: space.Name,
		taskID:       task.ID,
	}, "report.md", "text/markdown", "summary", []byte("# report"))
	if err != nil {
		t.Fatal(err)
	}
	if output.ArtifactID == "" || output.TaskID != task.ID {
		t.Fatalf("output = %+v", output)
	}
	updated, err := fileStore.GetTask(ctx, space.Name, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(updated.Artifacts) != 1 || updated.Artifacts[0] != output.ArtifactID {
		t.Fatalf("task artifacts = %#v", updated.Artifacts)
	}
	artifact, content, err := fileStore.GetArtifact(ctx, space.Name, output.ArtifactID)
	if err != nil {
		t.Fatal(err)
	}
	if artifact.Type != "Markdown" || string(content) != "# report" {
		t.Fatalf("artifact = %+v content=%q", artifact, content)
	}
}

func TestReadStagedArtifactFileRejectsEscapes(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "ok.txt"), []byte("ok"), 0o644); err != nil {
		t.Fatal(err)
	}
	content, name, err := readStagedArtifactFile(root, "ok.txt")
	if err != nil {
		t.Fatal(err)
	}
	if name != "ok.txt" || string(content) != "ok" {
		t.Fatalf("name=%q content=%q", name, content)
	}
	if _, _, err := readStagedArtifactFile(root, filepath.Join("..", "secret.txt")); err == nil {
		t.Fatal("expected path escape to fail")
	}
}

func TestPersistSkillArtifactCandidatesSavesDeclaredArtifacts(t *testing.T) {
	ctx := context.Background()
	fileStore := store.New(t.TempDir())
	space, err := fileStore.CreateAgentSpace(ctx, model.AgentSpace{Name: "test2"})
	if err != nil {
		t.Fatal(err)
	}
	task, err := fileStore.CreateTask(ctx, model.Task{
		AgentSpaceName: space.Name,
		Instruction:  "generate report",
		Status:       model.StatusInProgress,
	})
	if err != nil {
		t.Fatal(err)
	}
	stagingDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(stagingDir, "report.md"), []byte("# generated"), 0o644); err != nil {
		t.Fatal(err)
	}
	service := NewService(fileStore, "", "")
	event := &adksession.Event{
		LLMResponse: adkmodel.LLMResponse{
			Content: &genai.Content{Parts: []*genai.Part{{
				FunctionResponse: &genai.FunctionResponse{
					Name: skills.ExecuteActionToolName,
					Response: map[string]any{
						"skill":  "demo-skill",
						"action": "generate_report",
						"artifacts": []any{map[string]any{
							"ref":         "report.md",
							"name":        "validator-report.md",
							"mimeType":    "text/markdown",
							"description": "validator report",
						}},
					},
				},
			}},
			},
		},
	}

	service.persistSkillArtifactCandidates(ctx, space.Name, task.ID, stagingDir, event)

	updated, err := fileStore.GetTask(ctx, space.Name, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(updated.Artifacts) != 1 {
		t.Fatalf("task artifacts = %#v", updated.Artifacts)
	}
	artifact, content, err := fileStore.GetArtifact(ctx, space.Name, updated.Artifacts[0])
	if err != nil {
		t.Fatal(err)
	}
	if artifact.Name != "validator-report.md" || string(content) != "# generated" {
		t.Fatalf("artifact = %+v content=%q", artifact, content)
	}
}
