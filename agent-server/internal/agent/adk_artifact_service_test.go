package agent

import (
	"context"
	"testing"

	adkartifact "google.golang.org/adk/v2/artifact"
	"google.golang.org/genai"
)

func TestFileArtifactServiceVersionsAndLoads(t *testing.T) {
	ctx := context.Background()
	service := newFileArtifactService(t.TempDir())

	first, err := service.Save(ctx, &adkartifact.SaveRequest{
		AppName:   "app",
		UserID:    "as-1",
		SessionID: "task-1",
		FileName:  "report.md",
		Part: &genai.Part{InlineData: &genai.Blob{
			MIMEType: "text/markdown",
			Data:     []byte("one"),
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.Save(ctx, &adkartifact.SaveRequest{
		AppName:   "app",
		UserID:    "as-1",
		SessionID: "task-1",
		FileName:  "report.md",
		Part: &genai.Part{InlineData: &genai.Blob{
			MIMEType: "text/markdown",
			Data:     []byte("two"),
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if first.Version != 0 || second.Version != 1 {
		t.Fatalf("versions = %d/%d", first.Version, second.Version)
	}
	list, err := service.List(ctx, &adkartifact.ListRequest{
		AppName:   "app",
		UserID:    "as-1",
		SessionID: "task-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(list.FileNames) != 1 || list.FileNames[0] != "report.md" {
		t.Fatalf("list = %#v", list.FileNames)
	}
	loaded, err := service.Load(ctx, &adkartifact.LoadRequest{
		AppName:   "app",
		UserID:    "as-1",
		SessionID: "task-1",
		FileName:  "report.md",
	})
	if err != nil {
		t.Fatal(err)
	}
	if string(loaded.Part.InlineData.Data) != "two" {
		t.Fatalf("loaded = %q", loaded.Part.InlineData.Data)
	}
	versions, err := service.Versions(ctx, &adkartifact.VersionsRequest{
		AppName:   "app",
		UserID:    "as-1",
		SessionID: "task-1",
		FileName:  "report.md",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(versions.Versions) != 2 || versions.Versions[0] != 0 || versions.Versions[1] != 1 {
		t.Fatalf("versions = %#v", versions.Versions)
	}
	meta, err := service.GetArtifactVersion(ctx, &adkartifact.GetArtifactVersionRequest{
		AppName:   "app",
		UserID:    "as-1",
		SessionID: "task-1",
		FileName:  "report.md",
		Version:   1,
	})
	if err != nil {
		t.Fatal(err)
	}
	if meta.ArtifactVersion.MimeType != "text/markdown" {
		t.Fatalf("mime = %q", meta.ArtifactVersion.MimeType)
	}
}
