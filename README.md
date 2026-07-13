# NetX AI

NetX AI is a self-hosted AI operations workspace for infrastructure and SRE teams.

Create an agent, ask it to inspect systems, turn recurring checks into scheduled automations, review execution records, download generated reports, and notify your team when work finishes.

It is built for internal SRE teams that want an agentic workflow they can run, audit, and extend inside their own environment.

## What You Can Do

- Create isolated AgentSpaces for different operators or environments.
- Ask questions about system status and operational health.
- Run manual tasks with complete execution history.
- Schedule recurring inspections and report generation.
- Review artifacts produced by skills and automation runs.
- Send automation results and approval prompts to Enterprise WeChat.
- Use direct Gemini or a Gemini-compatible relay gateway.

## Use Cases

- Daily inspection reports.
- Service and infrastructure health checks.
- Endpoint status and operational summary checks.
- Scheduled operational summaries.
- Task-level audit trails for agent work.
- Team notifications with direct links back to task details.

## Quick Start

### 1. Start the Backend

```bash
cd agent-server
cp config/app.yaml.example config/app.yaml
go run .
```

The API listens on:

```text
http://127.0.0.1:8080
```

### 2. Start the Frontend

In a second terminal:

```bash
cd agent-ui
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

### 3. Create an AgentSpace

Use the Admin UI to create an AgentSpace and configure:

- LLM provider and model.
- API key or relay API key.
- Runtime environment variables required by your skills.
- Optional Enterprise WeChat webhook.

## Docker Compose

Create and edit the config:

```bash
cp agent-server/config/app.yaml.example agent-server/config/app.yaml
```

For Docker Compose, set:

```yaml
path:
  root: /app
publicURL: https://netx-agent.example.com
```

Start:

```bash
docker compose up --build -d
```

Open:

```text
http://localhost:8080
```

See [Deployment](docs/deployment.md) for production notes.

## Core Concepts

- **AgentSpace**: an isolated workspace with model settings, runtime variables, integrations, conversations, tasks, automations, and artifacts.
- **Task**: a unit of agent work with records, status, output, and artifacts.
- **Automation**: a schedule that creates and runs tasks automatically.
- **Skill**: a declared operational capability the agent can call, such as read-only health checks or report generation.
- **Artifact**: a generated report or file saved by a task.

## Model Providers

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

`baseUrl` must be the relay root URL. Do not include `/v1beta`.

LLM config is AgentSpace-scoped. Application runtime config belongs in `agent-server/config/app.yaml`.

## Architecture

NetX AI packages the UI and backend into one self-hosted service.

```text
Browser UI
  |
  | /api/v1 JSON
  v
Agent server
  |
  +-- AgentSpaces, tasks, automations, records, documents, artifacts
  +-- Agent runtime and skill execution
  +-- Enterprise WeChat notifications
  |
  v
Gemini or Gemini relay
```

See [Architecture](docs/architecture.md) for details.

## Documentation

- [Documentation index](docs/README.md)
- [Architecture](docs/architecture.md)
- [Configuration](docs/configuration.md)
- [Development](docs/development.md)
- [Deployment](docs/deployment.md)
- [API Reference](docs/api.md)
- [API Examples](docs/api-examples.md)
- [Skills and Tools](docs/skills-and-tools.md)
- [Integrations](docs/integrations.md)
- [Operations](docs/operations.md)
- [Documentation References](docs/references.md)

## Project Layout

```text
netx-ai/
├── agent-server/      # Go backend, ADK runtime, scheduler, skills
├── agent-ui/          # React frontend
├── docs/              # Maintained documentation
├── k8s/               # Kubernetes starter manifests
├── Dockerfile
└── docker-compose.yml
```

## Development Commands

Backend:

```bash
cd agent-server
go test ./...
go run .
```

Frontend:

```bash
cd agent-ui
npm install
npm run build
```

## Security Notes

- Do not commit `agent-server/config/app.yaml`.
- Do not commit model API keys, Enterprise WeChat webhook URLs, or private service endpoints.
- Enable Basic auth outside local development.
- Back up `agent-server/data/agents` before upgrades.
- Review new skills before enabling them in production.

## License

No open-source license file is currently included. Treat this repository as internal unless a license is added.
