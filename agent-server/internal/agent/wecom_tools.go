package agent

import (
	"context"
	"fmt"
	"strings"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/model"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/notify"
	adkagent "google.golang.org/adk/v2/agent"
	adktool "google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

const SendWeComMessageToolName = "send_wecom_message"

type sendWeComMessageInput struct {
	Title               string   `json:"title,omitempty" jsonschema:"Optional short title for the message."`
	Content             string   `json:"content" jsonschema:"Message body to send to the configured Enterprise WeChat group robot. Do not include secrets."`
	MessageType         string   `json:"messageType,omitempty" jsonschema:"Optional message type: markdown or text. Defaults to markdown."`
	Severity            string   `json:"severity,omitempty" jsonschema:"Optional status label such as info, success, warning, or error."`
	MentionedList       []string `json:"mentionedList,omitempty" jsonschema:"Optional Enterprise WeChat user ids to mention. Only applies to text messages."`
	MentionedMobileList []string `json:"mentionedMobileList,omitempty" jsonschema:"Optional mobile numbers to mention. Only applies to text messages."`
}

type sendWeComMessageOutput struct {
	Sent        bool   `json:"sent"`
	MessageType string `json:"messageType"`
	Severity    string `json:"severity,omitempty"`
	Warning     string `json:"warning,omitempty"`
}

func newWeComTools(space model.AgentSpace, client notify.WeComClient) ([]adktool.Tool, error) {
	cfg := space.Integrations.WeCom
	if !cfg.Enabled || strings.TrimSpace(cfg.WebhookURL) == "" {
		return nil, nil
	}
	sendTool, err := functiontool.New(
		functiontool.Config{
			Name:        SendWeComMessageToolName,
			Description: "Send a concise text or markdown notification to the Enterprise WeChat group configured on this AgentSpace. The webhook URL is held by the host and must never be requested from or shown to the model. Use only for user-requested notifications or important task/automation updates.",
		},
		func(ctx adkagent.Context, input sendWeComMessageInput) (sendWeComMessageOutput, error) {
			return sendWeComMessage(ctx, client, cfg, input)
		},
	)
	if err != nil {
		return nil, err
	}
	return []adktool.Tool{sendTool}, nil
}

func sendWeComMessage(ctx context.Context, client notify.WeComClient, cfg model.WeComConfig, input sendWeComMessageInput) (sendWeComMessageOutput, error) {
	if !cfg.Enabled || strings.TrimSpace(cfg.WebhookURL) == "" {
		return sendWeComMessageOutput{}, fmt.Errorf("wecom integration is disabled")
	}
	content := strings.TrimSpace(input.Content)
	if content == "" {
		return sendWeComMessageOutput{}, fmt.Errorf("content is required")
	}
	messageType := strings.ToLower(strings.TrimSpace(input.MessageType))
	if messageType == "" {
		messageType = "markdown"
	}
	severity := normalizeWeComSeverity(input.Severity)
	var warning string
	switch messageType {
	case "markdown":
		if len(input.MentionedList) > 0 || len(input.MentionedMobileList) > 0 {
			warning = "mentions are ignored for markdown messages"
		}
		if err := client.SendMarkdown(ctx, cfg.WebhookURL, formatWeComMarkdown(input.Title, severity, content)); err != nil {
			return sendWeComMessageOutput{}, err
		}
	case "text":
		if err := client.SendText(ctx, cfg.WebhookURL, formatWeComText(input.Title, severity, content), notify.TextOptions{
			MentionedList:       input.MentionedList,
			MentionedMobileList: input.MentionedMobileList,
		}); err != nil {
			return sendWeComMessageOutput{}, err
		}
	default:
		return sendWeComMessageOutput{}, fmt.Errorf("unsupported wecom messageType %q", input.MessageType)
	}
	return sendWeComMessageOutput{
		Sent:        true,
		MessageType: messageType,
		Severity:    severity,
		Warning:     warning,
	}, nil
}

func formatWeComMarkdown(title, severity, content string) string {
	lines := []string{}
	if strings.TrimSpace(title) != "" {
		lines = append(lines, "### "+strings.TrimSpace(title))
	}
	if severity != "" {
		lines = append(lines, fmt.Sprintf("> Severity: %s", strings.ToUpper(severity)))
	}
	lines = append(lines, strings.TrimSpace(content))
	return strings.Join(lines, "\n\n")
}

func formatWeComText(title, severity, content string) string {
	lines := []string{}
	if strings.TrimSpace(title) != "" {
		lines = append(lines, strings.TrimSpace(title))
	}
	if severity != "" {
		lines = append(lines, "Severity: "+strings.ToUpper(severity))
	}
	lines = append(lines, strings.TrimSpace(content))
	return strings.Join(lines, "\n")
}

func normalizeWeComSeverity(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "success", "ok", "passed", "pass":
		return "success"
	case "warning", "warn":
		return "warning"
	case "error", "failed", "fail", "failure":
		return "error"
	case "info", "":
		return "info"
	default:
		return strings.ToLower(strings.TrimSpace(value))
	}
}
