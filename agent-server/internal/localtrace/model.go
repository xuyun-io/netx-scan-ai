package localtrace

import "time"

// Scope identifies the local agent run that owns a trace record.
type Scope struct {
	AgentSpaceName string `json:"agentSpaceName"`
	TaskID         string `json:"taskId,omitempty"`
	SessionID      string `json:"sessionId,omitempty"`
	ConversationID string `json:"conversationId,omitempty"`
	TurnID         string `json:"turnId,omitempty"`
	Source         string `json:"source,omitempty"`
}

// ToolRecord is the durable, full-fidelity representation of one tool call.
// It is intentionally stored outside the ADK session so large raw results do
// not become model context on every subsequent turn.
type ToolRecord struct {
	Version        string         `json:"version"`
	Ref            string         `json:"ref,omitempty"`
	Scope          Scope          `json:"scope"`
	InvocationID   string         `json:"invocationId"`
	FunctionCallID string         `json:"functionCallId"`
	AgentName      string         `json:"agentName,omitempty"`
	ToolName       string         `json:"toolName"`
	Skill          string         `json:"skill,omitempty"`
	Action         string         `json:"action,omitempty"`
	Status         string         `json:"status,omitempty"`
	Request        map[string]any `json:"request,omitempty"`
	Response       map[string]any `json:"response,omitempty"`
	Error          string         `json:"error,omitempty"`
	RawBytes       int            `json:"rawBytes"`
	ModelBytes     int            `json:"modelBytes,omitempty"`
	StartedAt      time.Time      `json:"startedAt"`
	CompletedAt    time.Time      `json:"completedAt"`
	DurationMillis int64          `json:"durationMillis"`
	CreatedAt      time.Time      `json:"createdAt"`
}

// Reference is an opaque path relative to an AgentSpace local trace root.
type Reference struct {
	Ref string `json:"ref"`
}

type ModelCall struct {
	Sequence           int       `json:"sequence"`
	EventID            string    `json:"eventId,omitempty"`
	Model              string    `json:"model,omitempty"`
	StartedAt          time.Time `json:"startedAt"`
	CompletedAt        time.Time `json:"completedAt"`
	DurationMillis     int64     `json:"durationMillis"`
	InputTokens        int32     `json:"inputTokens"`
	OutputTokens       int32     `json:"outputTokens"`
	CachedInputTokens  int32     `json:"cachedInputTokens"`
	ToolUseInputTokens int32     `json:"toolUseInputTokens"`
	ReasoningTokens    int32     `json:"reasoningTokens"`
	TotalOutputTokens  int32     `json:"totalOutputTokens"`
	TotalTokens        int32     `json:"totalTokens"`
	FinishReason       string    `json:"finishReason,omitempty"`
	FunctionCallIDs    []string  `json:"functionCallIds"`
	Timestamp          time.Time `json:"timestamp"`
}

type InvocationSummary struct {
	Version            string      `json:"version"`
	Scope              Scope       `json:"scope"`
	InvocationID       string      `json:"invocationId"`
	Status             string      `json:"status"`
	StartedAt          time.Time   `json:"startedAt"`
	CompletedAt        *time.Time  `json:"completedAt,omitempty"`
	DurationMillis     int64       `json:"durationMillis"`
	ModelCalls         []ModelCall `json:"modelCalls"`
	ModelCallCount     int         `json:"modelCallCount"`
	ToolCallCount      int         `json:"toolCallCount"`
	ErrorCount         int         `json:"errorCount"`
	InputTokens        int64       `json:"inputTokens"`
	OutputTokens       int64       `json:"outputTokens"`
	CachedInputTokens  int64       `json:"cachedInputTokens"`
	ToolUseInputTokens int64       `json:"toolUseInputTokens"`
	ReasoningTokens    int64       `json:"reasoningTokens"`
	TotalOutputTokens  int64       `json:"totalOutputTokens"`
	TotalTokens        int64       `json:"totalTokens"`
	RawToolBytes       int64       `json:"rawToolBytes"`
	ModelToolBytes     int64       `json:"modelToolBytes"`
}

type InvocationTrace struct {
	Summary InvocationSummary `json:"summary"`
	Tools   []ToolRecord      `json:"tools"`
}
