package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/model"
)

const defaultWeComTimeout = 8 * time.Second
const maxWeComContentRunes = 3500

type TextOptions struct {
	MentionedList       []string
	MentionedMobileList []string
}

// WeComClient sends task notifications to an Enterprise WeChat group robot.
type WeComClient struct {
	HTTPClient *http.Client
	// PublicURL is the public-facing web UI base URL used for deep links.
	// Example: https://example.com
	PublicURL string
}

// NotifyTaskAwaitingApproval sends a notification when a task requires manual
// approval. It returns sent=false when the integration is disabled or incomplete.
func (c WeComClient) NotifyTaskAwaitingApproval(ctx context.Context, space model.AgentSpace, task model.Task) (sent bool, err error) {
	cfg := space.Integrations.WeCom
	if !cfg.Enabled || strings.TrimSpace(cfg.WebhookURL) == "" {
		return false, nil
	}
	return true, c.SendMarkdown(ctx, cfg.WebhookURL, approvalMarkdown(c.PublicURL, space, task))
}

func (c WeComClient) NotifyAutomationTaskFinished(ctx context.Context, space model.AgentSpace, task model.Task) (sent bool, err error) {
	cfg := space.Integrations.WeCom
	if !cfg.Enabled || strings.TrimSpace(cfg.WebhookURL) == "" {
		return false, nil
	}
	return true, c.SendMarkdown(ctx, cfg.WebhookURL, automationTaskMarkdown(c.PublicURL, space, task))
}

func (c WeComClient) SendText(ctx context.Context, webhookURL, content string, options TextOptions) error {
	content = truncateRunes(content, maxWeComContentRunes)
	payload := map[string]any{
		"msgtype": "text",
		"text": map[string]any{
			"content": content,
		},
	}
	textPayload := payload["text"].(map[string]any)
	if len(options.MentionedList) > 0 {
		textPayload["mentioned_list"] = options.MentionedList
	}
	if len(options.MentionedMobileList) > 0 {
		textPayload["mentioned_mobile_list"] = options.MentionedMobileList
	}
	return c.sendWebhook(ctx, webhookURL, payload)
}

func (c WeComClient) SendMarkdown(ctx context.Context, webhookURL, content string) error {
	content = truncateRunes(content, maxWeComContentRunes)
	payload := map[string]any{
		"msgtype": "markdown",
		"markdown": map[string]string{
			"content": content,
		},
	}
	return c.sendWebhook(ctx, webhookURL, payload)
}

func (c WeComClient) sendWebhook(ctx context.Context, webhookURL string, payload any) error {
	webhookURL = strings.TrimSpace(webhookURL)
	if webhookURL == "" {
		return fmt.Errorf("wecom webhook url is required")
	}
	client := c.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: defaultWeComTimeout}
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4*1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("wecom webhook returned http %d", resp.StatusCode)
	}
	var result struct {
		ErrCode int    `json:"errcode"`
		ErrMsg  string `json:"errmsg"`
	}
	if len(bytes.TrimSpace(respBody)) > 0 {
		if err := json.Unmarshal(respBody, &result); err == nil && result.ErrCode != 0 {
			msg := strings.TrimSpace(result.ErrMsg)
			if msg == "" {
				msg = "unknown error"
			}
			return fmt.Errorf("wecom webhook returned errcode %d: %s", result.ErrCode, msg)
		}
	}
	return nil
}

func automationTaskMarkdown(publicURL string, space model.AgentSpace, task model.Task) string {
	title := firstNonEmpty(task.Name, "未命名自动化")
	completedAt := time.Now().UTC()
	if task.CompletedAt != nil && !task.CompletedAt.IsZero() {
		completedAt = *task.CompletedAt
	}
	var durationLine string
	if task.StartedAt != nil {
		duration := completedAt.Sub(*task.StartedAt).Round(time.Second)
		if duration < 0 {
			duration = 0
		}
		durationLine = fmt.Sprintf("> Duration: %s\n", duration)
	}
	var linkLine string
	if publicURL != "" && space.Name != "" && task.ID != "" {
		link := fmt.Sprintf("%s/%s/#/task/%s", strings.TrimSuffix(publicURL, "/"), space.Name, task.ID)
		linkLine = fmt.Sprintf("> 查看任务: [打开任务详情](%s)\n", link)
	}
	artifactCount := len(task.Artifacts)
	return fmt.Sprintf("### NetX Agent 自动化执行完成\n"+
		"> Agent: %s\n"+
		"> Automation: %s\n"+
		"> Automation ID: `%s`\n"+
		"> Task ID: `%s`\n"+
		"> Source: %s\n"+
		"> Result: %s\n"+
		"> Completed: %s\n"+
		"%s"+
		"> Artifacts: %d\n"+
		"%s\n"+
		"**执行摘要**\n\n%s",
		space.Name,
		title,
		firstNonEmpty(task.AutomationID, "-"),
		firstNonEmpty(task.ID, "-"),
		firstNonEmpty(task.Source, "-"),
		taskResultLabel(task.Status),
		completedAt.Format(time.RFC3339),
		durationLine,
		artifactCount,
		linkLine,
		truncateRunes(taskResultSummary(task), 900),
	)
}

func taskResultLabel(status string) string {
	switch status {
	case model.StatusCompleted, model.StatusSuccess:
		return "SUCCESS"
	case model.StatusFailed:
		return "FAILED"
	case model.StatusCancelled:
		return "CANCELLED"
	default:
		return firstNonEmpty(status, "UNKNOWN")
	}
}

func taskResultSummary(task model.Task) string {
	if task.Output != nil {
		for _, key := range []string{"summary", "error", "reason"} {
			if value := strings.TrimSpace(task.Output[key]); value != "" {
				return value
			}
		}
	}
	if value := strings.TrimSpace(task.Description); value != "" {
		return value
	}
	return firstNonEmpty(task.Instruction, "任务已结束，但没有返回摘要。")
}

func approvalMarkdown(publicURL string, space model.AgentSpace, task model.Task) string {
	title := firstNonEmpty(task.Name, "未命名任务")
	priority := firstNonEmpty(task.Priority, "normal")
	taskType := firstNonEmpty(task.Type, "task")
	createdAt := task.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
	}
	agentSpaceName := space.Name
	var linkLine string
	if publicURL != "" && agentSpaceName != "" {
		link := fmt.Sprintf("%s/%s/#/task/%s", strings.TrimSuffix(publicURL, "/"), agentSpaceName, task.ID)
		linkLine = fmt.Sprintf("> 查看任务: [打开任务详情](%s)\n", link)
	}
	return fmt.Sprintf("### NetX Agent 审批提醒\n"+
		"> Agent: %s\n"+
		"> Task: %s\n"+
		"> Task ID: `%s`\n"+
		"> Priority: %s\n"+
		"> Type: %s\n"+
		"> Created: %s\n"+
		"%s\n"+
		"该任务包含写操作或敏感操作，需要人工审批后继续执行。\n\n"+
		"**指令**\n\n%s",
		space.Name,
		title,
		task.ID,
		priority,
		taskType,
		createdAt.Format(time.RFC3339),
		linkLine,
		truncateRunes(task.Instruction, 600),
	)
}

func truncateRunes(value string, max int) string {
	value = strings.TrimSpace(value)
	if max <= 0 {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= max {
		return value
	}
	return string(runes[:max]) + "..."
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
