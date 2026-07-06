package model

import "time"

const (
	StatusPending       = "PENDING"
	StatusInProgress    = "IN_PROGRESS"
	StatusAwaitingInput = "AWAITING_INPUT"
	StatusCompleted     = "COMPLETED"
	StatusSuccess       = "SUCCESS"
	StatusFailed        = "FAILED"
	StatusInactive      = "INACTIVE"
	StatusActive        = "ACTIVE"

	RecordResponse     = "RESPONSE"
	RecordToolCall     = "TOOL_CALL"
	RecordToolResult   = "TOOL_RESULT"
	RecordMemoryAccess = "MEMORY_ACCESS"
	RecordLoadSkill    = "LOAD_SKILL"
	RecordLoadTool     = "LOAD_TOOL"
	RecordThinking     = "THINKING"
	RecordStatus       = "STATUS"
	RecordError        = "ERROR"

	TaskSourceChat   = "chat"
	TaskSourceManual = "manual"
)

type AgentSpace struct {
	ID           string       `json:"agentSpaceId" yaml:"agentSpaceId"`
	Name         string       `json:"name" yaml:"name"`
	Description  string       `json:"description,omitempty" yaml:"description,omitempty"`
	LLM          LLMConfig    `json:"llm" yaml:"llm"`
	Environment  EnvVars      `json:"environment,omitempty" yaml:"environment,omitempty"`
	Integrations Integrations `json:"integrations" yaml:"integrations"`
	CreatedAt    time.Time    `json:"createdAt" yaml:"createdAt"`
	UpdatedAt    time.Time    `json:"updatedAt" yaml:"updatedAt"`
}

type LLMConfig struct {
	Provider string `json:"provider" yaml:"provider"`
	Model    string `json:"model" yaml:"model"`
	APIKey   string `json:"apiKey,omitempty" yaml:"apiKey,omitempty"`
	BaseURL  string `json:"baseUrl,omitempty" yaml:"baseUrl,omitempty"`
}

type EnvVars map[string]string

type Integrations struct {
	WeCom WeComConfig `json:"wecom" yaml:"wecom"`
}

type WeComConfig struct {
	Enabled    bool   `json:"enabled" yaml:"enabled"`
	WebhookURL string `json:"webhookUrl,omitempty" yaml:"webhookUrl,omitempty"`
}

type Conversation struct {
	ID           string    `json:"conversationId" yaml:"conversationId"`
	AgentSpaceID string    `json:"agentSpaceId" yaml:"agentSpaceId"`
	Title        string    `json:"title" yaml:"title"`
	Summary      string    `json:"summary,omitempty" yaml:"summary,omitempty"`
	CreatedAt    time.Time `json:"createdAt" yaml:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt" yaml:"updatedAt"`
}

type TurnOutput struct {
	ArtifactIDs []string `json:"artifactIds" yaml:"artifactIds"`
	Text        string   `json:"text" yaml:"text"`
}

type Turn struct {
	ID                   string      `json:"turnId" yaml:"turnId"`
	ConversationID       string      `json:"conversationId" yaml:"conversationId"`
	AgentSpaceID         string      `json:"agentSpaceId" yaml:"agentSpaceId"`
	Status               string      `json:"status" yaml:"status"`
	StatusReason         string      `json:"statusReason,omitempty" yaml:"statusReason,omitempty"`
	Prompt               string      `json:"prompt" yaml:"prompt"`
	DocumentIDs          []string    `json:"documentIds" yaml:"documentIds"`
	Output               *TurnOutput `json:"output" yaml:"output,omitempty"`
	PendingAgentRequests any         `json:"pendingAgentRequests" yaml:"pendingAgentRequests,omitempty"`
	TaskID               string      `json:"taskId,omitempty" yaml:"taskId,omitempty"`
	CreatedAt            time.Time   `json:"createdAt" yaml:"createdAt"`
	UpdatedAt            time.Time   `json:"updatedAt" yaml:"updatedAt"`
	CompletedAt          *time.Time  `json:"completedAt" yaml:"completedAt,omitempty"`
}

type Task struct {
	ID               string            `json:"taskId" yaml:"taskId"`
	AgentSpaceID     string            `json:"agentSpaceId" yaml:"agentSpaceId"`
	ConversationID   string            `json:"conversationId,omitempty" yaml:"conversationId,omitempty"`
	TurnID           string            `json:"turnId,omitempty" yaml:"turnId,omitempty"`
	Name             string            `json:"name" yaml:"name"`
	Description      string            `json:"description,omitempty" yaml:"description,omitempty"`
	Status           string            `json:"status" yaml:"status"`
	Priority         string            `json:"priority" yaml:"priority"`
	Type             string            `json:"type" yaml:"type"`
	Source           string            `json:"source" yaml:"source"`
	AutomationID     string            `json:"automationId,omitempty" yaml:"automationId,omitempty"`
	Instruction      string            `json:"instruction" yaml:"instruction"`
	Input            map[string]string `json:"input,omitempty" yaml:"input,omitempty"`
	Output           map[string]string `json:"output,omitempty" yaml:"output,omitempty"`
	Artifacts        []string          `json:"artifacts,omitempty" yaml:"artifacts,omitempty"`
	RequiresApproval bool              `json:"requiresApproval" yaml:"requiresApproval"`
	PreAuthorized    bool              `json:"preAuthorized" yaml:"preAuthorized"`
	ApprovedBy       string            `json:"approvedBy,omitempty" yaml:"approvedBy,omitempty"`
	ApprovedAt       *time.Time        `json:"approvedAt,omitempty" yaml:"approvedAt,omitempty"`
	CreatedAt        time.Time         `json:"createdAt" yaml:"createdAt"`
	UpdatedAt        time.Time         `json:"updatedAt" yaml:"updatedAt"`
	StartedAt        *time.Time        `json:"startedAt,omitempty" yaml:"startedAt,omitempty"`
	CompletedAt      *time.Time        `json:"completedAt,omitempty" yaml:"completedAt,omitempty"`
}

type Record struct {
	ID             string          `json:"recordId" yaml:"recordId"`
	AgentSpaceID   string          `json:"agentSpaceId" yaml:"agentSpaceId"`
	TaskID         string          `json:"taskId,omitempty" yaml:"taskId,omitempty"`
	ConversationID string          `json:"conversationId,omitempty" yaml:"conversationId,omitempty"`
	TurnID         string          `json:"turnId,omitempty" yaml:"turnId,omitempty"`
	Type           string          `json:"recordType" yaml:"recordType"`
	Content        string          `json:"content,omitempty" yaml:"content,omitempty"`
	ModelID        string          `json:"modelId,omitempty" yaml:"modelId,omitempty"`
	TokenCount     *int            `json:"tokenCount,omitempty" yaml:"tokenCount,omitempty"`
	Artifact       *RecordArtifact `json:"artifact,omitempty" yaml:"artifact,omitempty"`
	ToolCall       *ToolCall       `json:"toolCall,omitempty" yaml:"toolCall,omitempty"`
	ToolResult     *ToolResult     `json:"toolResult,omitempty" yaml:"toolResult,omitempty"`
	LoadSkill      *LoadSkill      `json:"loadSkill,omitempty" yaml:"loadSkill,omitempty"`
	LoadTool       *LoadTool       `json:"loadTool,omitempty" yaml:"loadTool,omitempty"`
	MemoryAccess   *MemoryAccess   `json:"memoryAccess,omitempty" yaml:"memoryAccess,omitempty"`
	CreatedAt      time.Time       `json:"createdAt" yaml:"createdAt"`
}

type ToolCall struct {
	Input     string `json:"input" yaml:"input"`
	ToolName  string `json:"toolName" yaml:"toolName"`
	ToolUseID string `json:"toolUseId" yaml:"toolUseId"`
	Skill     string `json:"skill,omitempty" yaml:"skill,omitempty"`
	Action    string `json:"action,omitempty" yaml:"action,omitempty"`
}

type ToolResult struct {
	Output    string `json:"output" yaml:"output"`
	ToolUseID string `json:"toolUseId" yaml:"toolUseId"`
	Skill     string `json:"skill,omitempty" yaml:"skill,omitempty"`
	Action    string `json:"action,omitempty" yaml:"action,omitempty"`
	IsError   bool   `json:"isError" yaml:"isError"`
}

type LoadSkill struct {
	SkillName string `json:"skillName" yaml:"skillName"`
	Input     string `json:"input,omitempty" yaml:"input,omitempty"`
	Output    string `json:"output,omitempty" yaml:"output,omitempty"`
	ToolUseID string `json:"toolUseId,omitempty" yaml:"toolUseId,omitempty"`
}

type LoadTool struct {
	ToolName  string `json:"toolName" yaml:"toolName"`
	Input     string `json:"input,omitempty" yaml:"input,omitempty"`
	Output    string `json:"output,omitempty" yaml:"output,omitempty"`
	ToolUseID string `json:"toolUseId,omitempty" yaml:"toolUseId,omitempty"`
}

type MemoryAccess struct {
	Operation string `json:"operation,omitempty" yaml:"operation,omitempty"`
	Content   string `json:"content,omitempty" yaml:"content,omitempty"`
}

type RecordArtifact struct {
	ArtifactID string `json:"artifactId,omitempty" yaml:"artifactId,omitempty"`
	Name       string `json:"name,omitempty" yaml:"name,omitempty"`
	Type       string `json:"type,omitempty" yaml:"type,omitempty"`
}

type Artifact struct {
	ID           string    `json:"artifactId" yaml:"artifactId"`
	AgentSpaceID string    `json:"agentSpaceId" yaml:"agentSpaceId"`
	TaskID       string    `json:"taskId,omitempty" yaml:"taskId,omitempty"`
	Name         string    `json:"name" yaml:"name"`
	Type         string    `json:"type" yaml:"type"`
	Size         int64     `json:"size" yaml:"size"`
	Path         string    `json:"path" yaml:"path"`
	CreatedAt    time.Time `json:"createdAt" yaml:"createdAt"`
}

type Document struct {
	ID           string     `json:"documentId" yaml:"documentId"`
	AgentSpaceID string     `json:"agentSpaceId" yaml:"agentSpaceId"`
	Name         string     `json:"name" yaml:"name"`
	ContentType  string     `json:"contentType,omitempty" yaml:"contentType,omitempty"`
	Size         int64      `json:"size" yaml:"size"`
	Status       string     `json:"status" yaml:"status"`
	Path         string     `json:"path" yaml:"path"`
	CreatedAt    time.Time  `json:"createdAt" yaml:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt" yaml:"updatedAt"`
	DeletedAt    *time.Time `json:"deletedAt,omitempty" yaml:"deletedAt,omitempty"`
}

type Page[T any] struct {
	Entities  []T    `json:"entities"`
	NextToken string `json:"nextToken,omitempty"`
}
