# Integrations

NetX AI currently includes Enterprise WeChat webhook integration.

## Enterprise WeChat

Enterprise WeChat is configured per AgentSpace and used by the backend as both:

- A system tool available to the agent when enabled.
- A notification channel for automation results and approval prompts.

## Setup

In the UI:

1. Open an AgentSpace.
2. Go to the Integrations section.
3. Add the Enterprise WeChat webhook URL.
4. Enable the integration.
5. Save the AgentSpace.

Equivalent AgentSpace configuration:

```yaml
integrations:
  wecom:
    enabled: true
    webhookUrl: https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...
```

Never commit a real webhook URL.

## Public Task Links

Set `publicURL` in `agent-server/config/app.yaml`:

```yaml
publicURL: https://netx-agent.example.com
```

Notification links use:

```text
{publicURL}/{agentSpaceName}/#/task/{taskId}
```

This URL must be reachable by message recipients.

## Automation Result Notifications

When an automation task finishes, the backend sends a concise message with:

- AgentSpace name.
- Automation name or ID.
- Task ID.
- Source.
- Result status.
- Completion time.
- Duration.
- Artifact count.
- A task detail link when `publicURL` is configured.
- A short execution summary when available.

Notification delivery is best-effort. If sending fails, the task remains completed or failed according to its execution result, and the notification error is added to task records.

## Approval Notifications

When a task requires approval, Enterprise WeChat can send a prompt containing the task detail link. The user still approves or rejects the task in the NetX AI UI.

## Agent System Tool

When Enterprise WeChat is enabled for an AgentSpace, the ADK agent receives a `send_wecom_message` system tool.

The tool is intended for:

- User-requested notifications.
- Important task or automation status updates.
- Short summaries that are safe to send to the configured group.

The tool must not reveal webhook URLs or secrets.

## Future Integration Direction

Enterprise WeChat can later support richer approval notification flows. Keep the current webhook integration as a notification transport and avoid embedding approval policy inside the webhook client.
