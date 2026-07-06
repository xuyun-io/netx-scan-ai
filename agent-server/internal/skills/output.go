package skills

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// SkillOutputVersion is the current version of the skill output envelope.
// Skill scripts should set output.version to this value.
const SkillOutputVersion = "1.0"

// OutputStatus describes the execution status of a skill action.
type OutputStatus string

const (
	// StatusOK means the action completed successfully.
	StatusOK OutputStatus = "ok"
	// StatusError means the action failed.
	StatusError OutputStatus = "error"
	// StatusPartial means the action produced partial results.
	StatusPartial OutputStatus = "partial"
	// StatusPending means the action is still in progress.
	StatusPending OutputStatus = "pending"
)

// OutputError contains structured error information from a skill action.
type OutputError struct {
	Code   string `json:"code"`
	Detail string `json:"detail,omitempty"`
}

// OutputDisplay gives rendering hints to the host / frontend.
type OutputDisplay struct {
	Format    string `json:"format,omitempty"`    // metric, table, list, json, markdown, status, log
	Title     string `json:"title,omitempty"`     // display title
	Unit      string `json:"unit,omitempty"`      // unit for metric values
	Collapsed bool   `json:"collapsed,omitempty"` // whether to collapse by default
}

// OutputMetadata contains execution metadata produced by the runner.
type OutputMetadata struct {
	Skill      string `json:"skill"`
	Action     string `json:"action"`
	Version    string `json:"version,omitempty"`
	Timestamp  string `json:"timestamp,omitempty"`
	Source     string `json:"source,omitempty"`
	ReadOnly   bool   `json:"readonly"`
	DurationMs int64  `json:"durationMs,omitempty"`
}

// SkillOutput is the unified envelope that every skill action should produce.
// The "data" field is intentionally open so that different skills can define
// their own schemas while the host can still handle status, message, errors
// and display hints in a consistent way.
type SkillOutput struct {
	Version  string          `json:"version"`
	Status   OutputStatus    `json:"status"`
	Message  string          `json:"message"`
	Data     map[string]any  `json:"data,omitempty"`
	Error    *OutputError    `json:"error,omitempty"`
	Display  *OutputDisplay  `json:"display,omitempty"`
	Metadata OutputMetadata  `json:"metadata"`
}

// IsError reports whether the skill output represents a failure.
func (o *SkillOutput) IsError() bool {
	if o == nil {
		return false
	}
	return o.Status == StatusError
}

// NormalizeSkillOutput converts raw script output into a unified SkillOutput envelope.
// It handles three cases:
//   1. stdout is already a valid SkillOutput envelope -> use it directly
//   2. stdout is JSON but not an envelope -> wrap it as data
//   3. stdout is plain text or empty -> wrap it as message
func NormalizeSkillOutput(stdout, stderr string, exitCode int, meta OutputMetadata) *SkillOutput {
	stdout = strings.TrimSpace(stdout)
	stderr = strings.TrimSpace(stderr)

	// Case 1: already an envelope.
	var envelope SkillOutput
	if isJSONObject(stdout) {
		if err := json.Unmarshal([]byte(stdout), &envelope); err == nil {
			if envelope.Version != "" && envelope.Status != "" && envelope.Message != "" {
				envelope.Metadata = mergeMetadata(envelope.Metadata, meta)
				return &envelope
			}
		}
	}

	// Build a normalized envelope from raw output.
	out := &SkillOutput{
		Version:  SkillOutputVersion,
		Status:   StatusOK,
		Message:  defaultMessage(stdout, exitCode),
		Metadata: meta,
	}

	if exitCode != 0 {
		out.Status = StatusError
		out.Message = firstNonEmptyString(stderr, stdout, fmt.Sprintf("action failed with exit code %d", exitCode))
		out.Error = &OutputError{
			Code:   "EXECUTION_FAILED",
			Detail: firstNonEmptyString(stderr, fmt.Sprintf("exit code %d", exitCode)),
		}
	}

	// Case 2: stdout is JSON but not an envelope -> put it under data.
	if isJSONObject(stdout) {
		var data map[string]any
		if err := json.Unmarshal([]byte(stdout), &data); err == nil {
			out.Data = data
			return out
		}
	}

	// Case 3: plain text -> keep as message and also expose raw text.
	if stdout != "" {
		out.Data = map[string]any{"raw": stdout}
	}

	return out
}

func isJSONObject(s string) bool {
	if s == "" {
		return false
	}
	if s[0] == '{' {
		return true
	}
	// Skip UTF-8 BOM if present.
	if len(s) > 3 && s[0] == '\xef' && s[1] == '\xbb' && s[2] == '\xbf' {
		return s[3] == '{'
	}
	return false
}

func mergeMetadata(existing, fallback OutputMetadata) OutputMetadata {
	if existing.Skill == "" {
		existing.Skill = fallback.Skill
	}
	if existing.Action == "" {
		existing.Action = fallback.Action
	}
	if existing.Version == "" {
		existing.Version = fallback.Version
	}
	if existing.Timestamp == "" {
		existing.Timestamp = fallback.Timestamp
	}
	if existing.Source == "" {
		existing.Source = fallback.Source
	}
	if !existing.ReadOnly {
		existing.ReadOnly = fallback.ReadOnly
	}
	if existing.DurationMs == 0 {
		existing.DurationMs = fallback.DurationMs
	}
	return existing
}

func defaultMessage(stdout string, exitCode int) string {
	if exitCode != 0 {
		return fmt.Sprintf("action failed with exit code %d", exitCode)
	}
	if stdout == "" {
		return "action completed"
	}
	return "action completed successfully"
}

func firstNonEmptyString(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// OutputMetadataFromResult builds OutputMetadata from ActionResult fields.
func OutputMetadataFromResult(result ActionResult, startedAt time.Time) OutputMetadata {
	return OutputMetadata{
		Skill:      result.Skill,
		Action:     result.Action,
		Version:    SkillOutputVersion,
		Timestamp:  startedAt.UTC().Format(time.RFC3339),
		Source:     result.Command,
		ReadOnly:   result.ReadOnly,
		DurationMs: result.Duration.Round(time.Millisecond).Milliseconds(),
	}
}
