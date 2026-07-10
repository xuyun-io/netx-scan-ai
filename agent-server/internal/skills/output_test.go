package skills

import "testing"

func TestNormalizeSkillOutputPreservesArtifacts(t *testing.T) {
	out := NormalizeSkillOutput(`{
		"version":"1.0",
		"status":"ok",
		"message":"report generated",
		"artifacts":[{"ref":"report.md","name":"report.md","mimeType":"text/markdown","size":12}]
	}`, "", 0, OutputMetadata{Skill: "demo", Action: "report", ReadOnly: true})
	if out == nil {
		t.Fatal("output is nil")
	}
	if len(out.Artifacts) != 1 {
		t.Fatalf("artifacts = %#v", out.Artifacts)
	}
	if out.Artifacts[0].Ref != "report.md" || out.Metadata.Skill != "demo" {
		t.Fatalf("output = %+v", out)
	}
}
