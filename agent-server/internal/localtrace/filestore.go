package localtrace

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
)

var safeSegmentPattern = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

type FileRepository struct {
	root string
	mu   sync.Mutex
}

func NewFileRepository(root string) *FileRepository {
	return &FileRepository{root: root}
}

func (r *FileRepository) SaveToolRecord(_ context.Context, record ToolRecord) (Reference, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if strings.TrimSpace(record.Scope.AgentSpaceName) == "" {
		return Reference{}, fmt.Errorf("agent space name is required")
	}
	invocationID := safeSegment(record.InvocationID, "invocation")
	callID := safeSegment(record.FunctionCallID, "tool-call")
	ref := filepath.ToSlash(filepath.Join(invocationID, "tools", callID+".json"))
	record.Ref = ref
	path, err := r.resolve(record.Scope.AgentSpaceName, ref)
	if err != nil {
		return Reference{}, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return Reference{}, err
	}
	data, err := json.MarshalIndent(record, "", "  ")
	if err != nil {
		return Reference{}, err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return Reference{}, err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return Reference{}, err
	}
	return Reference{Ref: ref}, nil
}

func (r *FileRepository) SaveInvocationSummary(_ context.Context, summary InvocationSummary) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if summary.Scope.AgentSpaceName == "" || summary.InvocationID == "" {
		return fmt.Errorf("agent space and invocation id are required")
	}
	ref := filepath.ToSlash(filepath.Join(safeSegment(summary.InvocationID, "invocation"), "summary.json"))
	path, err := r.resolve(summary.Scope.AgentSpaceName, ref)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return writeJSONFile(path, summary)
}

func (r *FileRepository) GetInvocationTrace(ctx context.Context, agentSpaceName, invocationID string) (InvocationTrace, error) {
	trace := InvocationTrace{Tools: []ToolRecord{}}
	ref := filepath.ToSlash(filepath.Join(safeSegment(invocationID, ""), "summary.json"))
	path, err := r.resolve(agentSpaceName, ref)
	if err != nil {
		return trace, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return trace, err
	}
	if err := json.Unmarshal(data, &trace.Summary); err != nil {
		return trace, err
	}
	if trace.Summary.ModelCalls == nil {
		trace.Summary.ModelCalls = []ModelCall{}
	}
	previousModelBoundary := trace.Summary.StartedAt
	trace.Summary.InputTokens = 0
	trace.Summary.OutputTokens = 0
	trace.Summary.CachedInputTokens = 0
	trace.Summary.ToolUseInputTokens = 0
	trace.Summary.ReasoningTokens = 0
	trace.Summary.TotalOutputTokens = 0
	trace.Summary.TotalTokens = 0
	for index := range trace.Summary.ModelCalls {
		call := &trace.Summary.ModelCalls[index]
		if call.CompletedAt.IsZero() {
			call.CompletedAt = call.Timestamp
		}
		if call.StartedAt.IsZero() {
			call.StartedAt = previousModelBoundary
		}
		if call.DurationMillis == 0 && !call.CompletedAt.Before(call.StartedAt) {
			call.DurationMillis = call.CompletedAt.Sub(call.StartedAt).Milliseconds()
		}
		if call.TotalOutputTokens == 0 {
			call.TotalOutputTokens = call.OutputTokens + call.ReasoningTokens
		}
		if call.FunctionCallIDs == nil {
			call.FunctionCallIDs = []string{}
		}
		previousModelBoundary = call.CompletedAt
		trace.Summary.InputTokens += int64(call.InputTokens)
		trace.Summary.OutputTokens += int64(call.OutputTokens)
		trace.Summary.CachedInputTokens += int64(call.CachedInputTokens)
		trace.Summary.ToolUseInputTokens += int64(call.ToolUseInputTokens)
		trace.Summary.ReasoningTokens += int64(call.ReasoningTokens)
		trace.Summary.TotalOutputTokens += int64(call.TotalOutputTokens)
		trace.Summary.TotalTokens += int64(call.TotalTokens)
	}
	toolsDir := filepath.Join(filepath.Dir(path), "tools")
	entries, err := os.ReadDir(toolsDir)
	if err != nil && !os.IsNotExist(err) {
		return trace, err
	}
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		record, err := r.GetToolRecord(ctx, agentSpaceName, filepath.ToSlash(filepath.Join(safeSegment(invocationID, ""), "tools", entry.Name())))
		if err == nil {
			record.Request = nil
			record.Response = nil
			trace.Tools = append(trace.Tools, record)
		}
	}
	sort.Slice(trace.Tools, func(i, j int) bool { return trace.Tools[i].StartedAt.Before(trace.Tools[j].StartedAt) })
	trace.Summary.ToolCallCount = len(trace.Tools)
	trace.Summary.RawToolBytes = 0
	trace.Summary.ModelToolBytes = 0
	trace.Summary.ErrorCount = 0
	for _, tool := range trace.Tools {
		trace.Summary.RawToolBytes += int64(tool.RawBytes)
		trace.Summary.ModelToolBytes += int64(tool.ModelBytes)
		if tool.Status == "error" || tool.Error != "" {
			trace.Summary.ErrorCount++
		}
	}
	return trace, nil
}

func (r *FileRepository) FindInvocationTraces(ctx context.Context, scope Scope) ([]InvocationTrace, error) {
	root, err := r.resolve(scope.AgentSpaceName, ".")
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(root)
	if os.IsNotExist(err) {
		return []InvocationTrace{}, nil
	}
	if err != nil {
		return nil, err
	}
	traces := []InvocationTrace{}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		trace, err := r.GetInvocationTrace(ctx, scope.AgentSpaceName, entry.Name())
		if err != nil || !matchesScope(trace.Summary.Scope, scope) {
			continue
		}
		traces = append(traces, trace)
	}
	sort.Slice(traces, func(i, j int) bool { return traces[i].Summary.StartedAt.Before(traces[j].Summary.StartedAt) })
	return traces, nil
}

func (r *FileRepository) GetToolRecord(_ context.Context, agentSpaceName, ref string) (ToolRecord, error) {
	var record ToolRecord
	path, err := r.resolve(agentSpaceName, ref)
	if err != nil {
		return record, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return record, err
	}
	if err := json.Unmarshal(data, &record); err != nil {
		return record, err
	}
	return record, nil
}

func (r *FileRepository) resolve(agentSpaceName, ref string) (string, error) {
	if strings.TrimSpace(agentSpaceName) == "" || safeSegment(agentSpaceName, "") != agentSpaceName {
		return "", fmt.Errorf("invalid agent space name")
	}
	if strings.TrimSpace(ref) == "" || filepath.IsAbs(ref) {
		return "", fmt.Errorf("invalid trace reference")
	}
	root, err := filepath.Abs(filepath.Join(r.root, agentSpaceName, "traces"))
	if err != nil {
		return "", err
	}
	path, err := filepath.Abs(filepath.Join(root, filepath.FromSlash(ref)))
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(root, path)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("trace reference escapes agent space")
	}
	return path, nil
}

func safeSegment(value, fallback string) string {
	value = strings.TrimSpace(value)
	value = safeSegmentPattern.ReplaceAllString(value, "-")
	value = strings.Trim(value, ".-")
	if value == "" {
		return fallback
	}
	if len(value) > 160 {
		value = value[:160]
	}
	return value
}

func writeJSONFile(path string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func matchesScope(value, filter Scope) bool {
	if filter.TaskID != "" && value.TaskID != filter.TaskID {
		return false
	}
	if filter.ConversationID != "" && value.ConversationID != filter.ConversationID {
		return false
	}
	if filter.TurnID != "" && value.TurnID != filter.TurnID {
		return false
	}
	return filter.TaskID != "" || filter.TurnID != "" || filter.ConversationID != ""
}
