# NetX AI

NetX AI is a self-hosted Chain287 SRE agent workspace. It combines a Go backend, a React workspace UI, Google ADK-Go based agent execution, file-backed persistence, scheduled automations, skill tools, artifacts, and Enterprise WeChat notifications.

The project is designed for operators who need a practical internal agent system rather than a general-purpose SaaS platform.

## Highlights

- Multi-AgentSpace management with isolated model config, environment variables, integrations, and records.
- Chat conversations backed by ADK turn execution.
- Manual tasks, approval-aware tasks, and scheduled automations.
- Chain287 read-only inspection skills and report artifact generation.
- Gemini and Gemini-compatible relay support.
- Enterprise WeChat notifications and an optional agent system tool.
- File-backed storage using YAML, JSONL, Markdown, uploaded files, and generated artifacts.
- All-in-one Docker image that serves the frontend and backend from one process.

## Architecture

```text
React UI
  |
  | /api/v1 JSON
  v
Go agent server
  |
  +-- File store for AgentSpaces, tasks, automations, records, documents, artifacts
  +-- Google ADK-Go runner
  +-- Skill runner for Chain287 inspection tools
  +-- Enterprise WeChat notification client
  |
  v
Gemini or Gemini relay
```

See [Architecture](docs/architecture.md) for details.

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
- `CHAIN287_RPC_URL`.
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
- Do not commit model API keys, Enterprise WeChat webhook URLs, or private RPC endpoints.
- Enable Basic auth outside local development.
- Back up `agent-server/data/agents` before upgrades.
- Review new skills before enabling them in production.

## License

No open-source license file is currently included. Treat this repository as internal unless a license is added.
