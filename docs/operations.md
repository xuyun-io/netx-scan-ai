# Operations

This page covers routine operations for NetX AI.

## Health Check

```bash
curl http://127.0.0.1:8080/api/v1/healthz
```

Expected response:

```json
{
  "status": "ok"
}
```

## Logs

Use JSON logs in container environments:

```yaml
logFormat: json
logLevel: info
```

Use console logs while developing locally:

```yaml
logFormat: console
logLevel: debug
```

Important log areas:

- Server startup and shutdown.
- HTTP request status and latency.
- Automation registration and trigger events.
- Task lifecycle events.
- Enterprise WeChat notification success or failure.

Logs should not contain API keys, webhook URLs, or private RPC credentials.

## Backups

Back up the configured agent data directory:

```text
agent-server/data/agents
```

This directory contains AgentSpace config, conversations, tasks, automations, records, documents, and artifacts.

Suggested backup timing:

- Before upgrades.
- Before changing storage paths.
- On a daily schedule for active environments.
- Before deleting AgentSpaces.

## Restore

1. Stop the service.
2. Restore the backed-up agent data directory.
3. Start the service.
4. Check `/api/v1/healthz`.
5. Open the UI and verify AgentSpaces, automations, tasks, and artifacts.

## Common Issues

### UI Opens but API Calls Fail

Check:

- Backend is running.
- Vite proxy is pointing to `http://127.0.0.1:8080`.
- Basic auth credentials are correct.
- Browser session storage does not contain old credentials.

### Automation Runs but No WeChat Message Arrives

Check:

- AgentSpace Enterprise WeChat integration is enabled.
- Webhook URL is valid.
- `publicURL` is configured and reachable.
- Task records contain a notification error.
- The Enterprise WeChat robot has permission to post to the target group.

### Task Links in Messages Do Not Open

Check:

- `publicURL` is not empty.
- `publicURL` is not a container-only address.
- Reverse proxy routes `/{agentSpaceName}/#/task/{taskId}` to the UI.
- Auth credentials are available to the recipient.

### Skill Execution Fails

Check:

- `CHAIN287_RPC_URL` is configured.
- `cast` is installed when running outside Docker.
- Scripts in `agent-server/skills/*/scripts` are executable in the target environment.
- The skill action exists in `tools.yaml`.
- Task records include the tool error details.

### Gemini Relay Fails

Check:

- AgentSpace uses `provider: gemini-relay`.
- `baseUrl` is the relay root and does not include `/v1beta`.
- The relay accepts `Authorization: Bearer <apiKey>`.
- The selected model name is available through the relay.

## Data Retention

There is no automatic retention policy yet. Operators should define their own retention process for:

- Old task records.
- Generated artifacts.
- Uploaded documents.
- Historical conversations.

Delete through the UI or API when possible so indexes stay consistent.

## Security Notes

- Enable Basic auth outside trusted local development.
- Put production deployments behind HTTPS.
- Restrict filesystem access to the agent data directory.
- Treat AgentSpace environment variables as secrets.
- Keep webhook URLs and model API keys out of source control.
- Review new skills before enabling them in production.
