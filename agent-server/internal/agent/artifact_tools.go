package agent

import (
	"context"
	"encoding/base64"
	"fmt"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/model"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/store"
	adkagent "google.golang.org/adk/v2/agent"
	adktool "google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
	"google.golang.org/genai"
)

const (
	SaveArtifactTextToolName    = "save_artifact_text"
	ListArtifactsToolName       = "list_artifacts"
	LoadArtifactPreviewToolName = "load_artifact_preview"

	maxArtifactToolBytes   = 10 * 1024 * 1024
	defaultPreviewMaxBytes = 8 * 1024
)

type artifactToolRuntime struct {
	store        *store.Store
	agentSpaceName string
	taskID       string
	stagingDir   string
}

type saveArtifactTextInput struct {
	Name        string `json:"name" jsonschema:"Artifact filename. Include an extension such as .md, .json, .csv, .txt, or .html."`
	Content     string `json:"content" jsonschema:"Text content to persist. Skill-generated files are persisted automatically when the skill returns artifact metadata."`
	MimeType    string `json:"mimeType,omitempty" jsonschema:"Optional MIME type, for example text/markdown or application/json."`
	Description string `json:"description,omitempty" jsonschema:"Optional short description for records."`
}

type saveArtifactFileInput struct {
	Path        string `json:"path"`
	Name        string `json:"name,omitempty" jsonschema:"Optional output filename. Defaults to the source filename."`
	MimeType    string `json:"mimeType,omitempty" jsonschema:"Optional MIME type, for example application/pdf or text/csv."`
	Description string `json:"description,omitempty" jsonschema:"Optional short description for records."`
}

type listArtifactsInput struct {
	TaskOnly bool `json:"taskOnly,omitempty" jsonschema:"When true, return only artifacts linked to the current task."`
}

type loadArtifactPreviewInput struct {
	ArtifactID string `json:"artifactId" jsonschema:"Artifact id returned by save_artifact_text or list_artifacts."`
	MaxBytes   int    `json:"maxBytes,omitempty" jsonschema:"Maximum preview bytes. Defaults to 8192 and is capped at 8192."`
}

type artifactSaveOutput struct {
	ArtifactID string `json:"artifactId"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	MimeType   string `json:"mimeType"`
	Size       int64  `json:"size"`
	TaskID     string `json:"taskId,omitempty"`
	ADKName    string `json:"adkName,omitempty"`
	ADKVersion int64  `json:"adkVersion,omitempty"`
	Warning    string `json:"warning,omitempty"`
}

type artifactSummary struct {
	ArtifactID string `json:"artifactId"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	Size       int64  `json:"size"`
	TaskID     string `json:"taskId,omitempty"`
	CreatedAt  string `json:"createdAt"`
}

type listArtifactsOutput struct {
	Artifacts []artifactSummary `json:"artifacts"`
}

type artifactPreviewOutput struct {
	Artifact  artifactSummary `json:"artifact"`
	Preview   string          `json:"preview"`
	Encoding  string          `json:"encoding"`
	Truncated bool            `json:"truncated"`
}

func newArtifactTools(fileStore *store.Store, agentSpaceName, taskID, stagingDir string) ([]adktool.Tool, error) {
	runtime := artifactToolRuntime{
		store:        fileStore,
		agentSpaceName: agentSpaceName,
		taskID:       taskID,
		stagingDir:   stagingDir,
	}
	saveTextTool, err := functiontool.New(
		functiontool.Config{
			Name:        SaveArtifactTextToolName,
			Description: "Persist text content as a durable task artifact. Use for reports, markdown, JSON, CSV, HTML, and concise generated outputs that should not be lost in chat history.",
		},
		func(ctx adkagent.Context, input saveArtifactTextInput) (artifactSaveOutput, error) {
			return saveArtifactText(ctx, runtime, input)
		},
	)
	if err != nil {
		return nil, err
	}
	listTool, err := functiontool.New(
		functiontool.Config{
			Name:        ListArtifactsToolName,
			Description: "List durable artifacts available in the current agent space. Use taskOnly=true to focus on the current task.",
		},
		func(ctx adkagent.Context, input listArtifactsInput) (listArtifactsOutput, error) {
			return listArtifacts(ctx, runtime, input)
		},
	)
	if err != nil {
		return nil, err
	}
	previewTool, err := functiontool.New(
		functiontool.Config{
			Name:        LoadArtifactPreviewToolName,
			Description: "Load a small preview of an existing artifact by id. The preview is capped so large artifacts are not copied into model context.",
		},
		func(ctx adkagent.Context, input loadArtifactPreviewInput) (artifactPreviewOutput, error) {
			return loadArtifactPreview(ctx, runtime, input)
		},
	)
	if err != nil {
		return nil, err
	}
	return []adktool.Tool{saveTextTool, listTool, previewTool}, nil
}

func saveArtifactText(ctx adkagent.Context, runtime artifactToolRuntime, input saveArtifactTextInput) (artifactSaveOutput, error) {
	name := normalizeArtifactName(input.Name, "artifact.txt")
	content := []byte(input.Content)
	if len(content) > maxArtifactToolBytes {
		return artifactSaveOutput{}, fmt.Errorf("artifact exceeds %d bytes", maxArtifactToolBytes)
	}
	mimeType := artifactMimeType(name, input.MimeType, content)
	return saveArtifactBytes(ctx, runtime, name, mimeType, strings.TrimSpace(input.Description), content)
}

func saveArtifactFile(ctx adkagent.Context, runtime artifactToolRuntime, input saveArtifactFileInput) (artifactSaveOutput, error) {
	content, sourceName, err := readStagedArtifactFile(runtime.stagingDir, input.Path)
	if err != nil {
		return artifactSaveOutput{}, err
	}
	name := normalizeArtifactName(firstNonEmpty(input.Name, sourceName), sourceName)
	mimeType := artifactMimeType(name, input.MimeType, content)
	return saveArtifactBytes(ctx, runtime, name, mimeType, strings.TrimSpace(input.Description), content)
}

func saveArtifactBytes(ctx adkagent.Context, runtime artifactToolRuntime, name, mimeType, description string, content []byte) (artifactSaveOutput, error) {
	if runtime.store == nil {
		return artifactSaveOutput{}, fmt.Errorf("artifact store is required")
	}
	if runtime.agentSpaceName == "" {
		return artifactSaveOutput{}, fmt.Errorf("agentSpaceName is required")
	}
	if len(content) > maxArtifactToolBytes {
		return artifactSaveOutput{}, fmt.Errorf("artifact exceeds %d bytes", maxArtifactToolBytes)
	}
	artifact, err := runtime.store.CreateArtifact(ctx, model.Artifact{
		AgentSpaceName: runtime.agentSpaceName,
		TaskID:       runtime.taskID,
		Name:         name,
		Type:         artifactTypeFor(name, mimeType),
	}, content)
	if err != nil {
		return artifactSaveOutput{}, err
	}
	if runtime.taskID != "" {
		if err := attachArtifactToTask(ctx, runtime.store, runtime.agentSpaceName, runtime.taskID, artifact.ID); err != nil {
			return artifactSaveOutput{}, err
		}
		recordContent := "产物已保存：" + artifact.Name
		if description != "" {
			recordContent = recordContent + " - " + description
		}
		_ = runtime.store.AppendTaskRecord(ctx, model.Record{
			ID:           store.NewRecordID(),
			AgentSpaceName: runtime.agentSpaceName,
			TaskID:       runtime.taskID,
			Type:         model.RecordStatus,
			Content:      recordContent,
			Artifact: &model.RecordArtifact{
				ArtifactID: artifact.ID,
				Name:       artifact.Name,
				Type:       artifact.Type,
			},
		})
	}
	output := artifactSaveOutput{
		ArtifactID: artifact.ID,
		Name:       artifact.Name,
		Type:       artifact.Type,
		MimeType:   mimeType,
		Size:       artifact.Size,
		TaskID:     artifact.TaskID,
		ADKName:    name,
	}
	if ctx != nil && ctx.Artifacts() != nil {
		version, err := saveADKArtifact(ctx, name, mimeType, content)
		if err != nil {
			output.Warning = "product artifact saved, ADK artifact save failed: " + err.Error()
		} else {
			output.ADKVersion = version
		}
	}
	return output, nil
}

func listArtifacts(ctx context.Context, runtime artifactToolRuntime, input listArtifactsInput) (listArtifactsOutput, error) {
	artifacts, err := runtime.store.ListArtifacts(ctx, runtime.agentSpaceName)
	if err != nil {
		return listArtifactsOutput{}, err
	}
	output := listArtifactsOutput{Artifacts: []artifactSummary{}}
	for _, artifact := range artifacts {
		if input.TaskOnly && runtime.taskID != "" && artifact.TaskID != runtime.taskID {
			continue
		}
		output.Artifacts = append(output.Artifacts, artifactToSummary(artifact))
	}
	return output, nil
}

func loadArtifactPreview(ctx context.Context, runtime artifactToolRuntime, input loadArtifactPreviewInput) (artifactPreviewOutput, error) {
	if strings.TrimSpace(input.ArtifactID) == "" {
		return artifactPreviewOutput{}, fmt.Errorf("artifactId is required")
	}
	maxBytes := input.MaxBytes
	if maxBytes <= 0 || maxBytes > defaultPreviewMaxBytes {
		maxBytes = defaultPreviewMaxBytes
	}
	artifact, content, err := runtime.store.GetArtifact(ctx, runtime.agentSpaceName, input.ArtifactID)
	if err != nil {
		return artifactPreviewOutput{}, err
	}
	truncated := len(content) > maxBytes
	if truncated {
		content = content[:maxBytes]
	}
	encoding := "utf-8"
	preview := string(content)
	if !utf8.Valid(content) {
		encoding = "base64"
		preview = base64.StdEncoding.EncodeToString(content)
	}
	return artifactPreviewOutput{
		Artifact:  artifactToSummary(artifact),
		Preview:   preview,
		Encoding:  encoding,
		Truncated: truncated,
	}, nil
}

func saveADKArtifact(ctx adkagent.Context, name, mimeType string, content []byte) (int64, error) {
	resp, err := ctx.Artifacts().Save(ctx, name, &genai.Part{
		InlineData: &genai.Blob{
			MIMEType: mimeType,
			Data:     content,
		},
	})
	if err != nil {
		return 0, err
	}
	if resp == nil {
		return 0, nil
	}
	return resp.Version, nil
}

func attachArtifactToTask(ctx context.Context, fileStore *store.Store, agentSpaceName, taskID, artifactID string) error {
	task, err := fileStore.GetTask(ctx, agentSpaceName, taskID)
	if err != nil {
		return err
	}
	for _, existing := range task.Artifacts {
		if existing == artifactID {
			return nil
		}
	}
	task.Artifacts = append(task.Artifacts, artifactID)
	return fileStore.UpdateTask(ctx, task)
}

func readStagedArtifactFile(stagingDir, inputPath string) ([]byte, string, error) {
	stagingDir = strings.TrimSpace(stagingDir)
	inputPath = strings.TrimSpace(inputPath)
	if stagingDir == "" {
		return nil, "", fmt.Errorf("artifact staging directory is not configured for this run")
	}
	if inputPath == "" {
		return nil, "", fmt.Errorf("path is required")
	}
	absRoot, err := filepath.Abs(stagingDir)
	if err != nil {
		return nil, "", err
	}
	path, err := normalizeStagedArtifactPath(inputPath)
	if err != nil {
		return nil, "", err
	}
	if !filepath.IsAbs(path) {
		path = filepath.Join(absRoot, path)
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		return nil, "", err
	}
	if !pathInside(absRoot, absPath) {
		return nil, "", fmt.Errorf("artifact file must be under the artifact staging directory")
	}
	info, err := os.Stat(absPath)
	if err != nil {
		return nil, "", err
	}
	if info.IsDir() {
		return nil, "", fmt.Errorf("artifact path is a directory")
	}
	if info.Size() > maxArtifactToolBytes {
		return nil, "", fmt.Errorf("artifact exceeds %d bytes", maxArtifactToolBytes)
	}
	content, err := os.ReadFile(absPath)
	if err != nil {
		return nil, "", err
	}
	return content, filepath.Base(absPath), nil
}

func normalizeStagedArtifactPath(inputPath string) (string, error) {
	if !strings.HasPrefix(strings.ToLower(inputPath), "file://") {
		return inputPath, nil
	}
	parsed, err := url.Parse(inputPath)
	if err != nil {
		return "", err
	}
	path := filepath.FromSlash(parsed.Path)
	if parsed.Host != "" {
		path = `\\` + parsed.Host + path
	}
	if len(path) >= 3 && path[0] == filepath.Separator && path[2] == ':' {
		path = path[1:]
	}
	return path, nil
}

func artifactToSummary(artifact model.Artifact) artifactSummary {
	return artifactSummary{
		ArtifactID: artifact.ID,
		Name:       artifact.Name,
		Type:       artifact.Type,
		Size:       artifact.Size,
		TaskID:     artifact.TaskID,
		CreatedAt:  artifact.CreatedAt.Format(timeRFC3339OrEmpty),
	}
}

const timeRFC3339OrEmpty = "2006-01-02T15:04:05Z07:00"

func normalizeArtifactName(name, fallback string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		name = fallback
	}
	name = store.SafeName(filepath.Base(name))
	if name == "." || name == string(filepath.Separator) {
		return store.SafeName(fallback)
	}
	return name
}

func artifactMimeType(name, explicit string, content []byte) string {
	if strings.TrimSpace(explicit) != "" {
		return strings.TrimSpace(explicit)
	}
	if extType := mime.TypeByExtension(strings.ToLower(filepath.Ext(name))); extType != "" {
		return extType
	}
	if len(content) > 0 {
		return http.DetectContentType(content)
	}
	return "text/plain; charset=utf-8"
}

func artifactTypeFor(name, mimeType string) string {
	lowerMime := strings.ToLower(mimeType)
	switch {
	case strings.Contains(lowerMime, "markdown"):
		return "Markdown"
	case strings.Contains(lowerMime, "html"):
		return "HTML"
	case strings.Contains(lowerMime, "json"):
		return "JSON"
	case strings.Contains(lowerMime, "csv"):
		return "CSV"
	case strings.Contains(lowerMime, "pdf"):
		return "PDF"
	case strings.HasPrefix(lowerMime, "image/"):
		return "Image"
	}
	switch strings.ToLower(filepath.Ext(name)) {
	case ".md":
		return "Markdown"
	case ".html", ".htm":
		return "HTML"
	case ".json":
		return "JSON"
	case ".csv":
		return "CSV"
	case ".pdf":
		return "PDF"
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg":
		return "Image"
	default:
		return "Text"
	}
}

func pathInside(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return false
	}
	return rel == "." || (!strings.HasPrefix(rel, "..") && !filepath.IsAbs(rel))
}
