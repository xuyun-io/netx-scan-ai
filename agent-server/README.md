# NetX AI Agent Server

The agent server is the Go backend for NetX AI. It exposes the `/api/v1` JSON API, serves the built frontend, persists AgentSpace data, runs ADK model sessions, executes skills, schedules automations, and sends Enterprise WeChat notifications.

## Responsibilities

- AgentSpace, conversation, task, automation, document, artifact, and record APIs.
- Google ADK-Go v2 model execution.
- Gemini and Gemini relay model configuration.
- Chain287 skill runner integration.
- File-backed persistence.
- Scheduled automation execution.
- Enterprise WeChat notification and system tool support.
- Static frontend hosting.
- Optional Basic auth.
- Structured logging with JSON or console output.

## Local Run

```bash
cd agent-server
cp config/app.yaml.example config/app.yaml
go test ./...
go run .
```

The server listens on `http://127.0.0.1:8080` by default.

## Configuration

Application configuration lives in:

```text
agent-server/config/app.yaml
```

Use:

```bash
cp config/app.yaml.example config/app.yaml
```

Important fields:

| Field | Purpose |
| --- | --- |
| `httpAddr` | HTTP listen address. |
| `path.root` | Base directory for relative paths. |
| `path.agents` | AgentSpace data directory. |
| `path.web` | Built frontend directory. |
| `path.skills` | Skill directory. |
| `publicURL` | External URL used in task notification links. |
| `logLevel` | `debug`, `info`, `warn`, or `error`. |
| `logFormat` | `json` or `console`. |
| `auth.username` / `auth.password` | Enables Basic auth when both are set. |

See [Configuration](../docs/configuration.md).

## AgentSpace LLM Providers

LLM settings are stored on each AgentSpace.

Direct Gemini:

```yaml
llm:
  provider: gemini
  model: gemini-2.5-pro
  apiKey: your-gemini-api-key
```

Gemini relay:

```yaml
llm:
  provider: gemini-relay
  model: gemini-2.5-pro
  apiKey: your-relay-api-key
  baseUrl: https://relay.example.com
```

For relay mode, `baseUrl` must be the relay root URL and must not include `/v1beta`.

## API

The API is mounted under `/api/v1`.

Main endpoint groups:

- AgentSpaces
- Conversations and turns
- Tasks
- Automations
- Records
- Artifacts
- Context documents
- Auth and health

See [API Reference](../docs/api.md) and [API Examples](../docs/api-examples.md).

## Data Directory

The default data directory is:

```text
agent-server/data/agents
```

Typical layout:

```text
{agentsDir}/{agentSpaceName}/
├── agent.yaml
├── conversations/{conversationId}/
│   ├── conversation.yaml
│   ├── turns.jsonl
│   └── records.jsonl
├── tasks/{taskId}/
│   ├── task.yaml
│   └── records.jsonl
├── automations/{automationId}.yaml
├── documents/
├── artifacts/
├── memory/
└── index/
```

Back up this directory before upgrades.

## Serving the Frontend

Build the UI:

```bash
cd ../agent-ui
npm run build
```

Copy it into the backend static directory:

```bash
cd ../agent-server
mkdir -p web/dist
cp -r ../agent-ui/dist/* web/dist/
go run .
```

The Dockerfile performs this automatically.

## Tests

```bash
go test ./...
```

## Operational Notes

- Use JSON logs in containers.
- Do not log or commit secrets.
- Keep `publicURL` reachable by Enterprise WeChat recipients.
- Use `CHAIN287_RPC_URL` in AgentSpace environment variables for real Chain287 skills.
- Keep skills read-only unless an explicit approval workflow is added.
