# Development

This guide covers local development for the Go backend and React frontend.

## Prerequisites

- Go 1.26.x.
- Node.js 24.x and npm.
- Docker and Docker Compose for container builds.
- Any command-line tools required by the skills you enable.
- A Gemini API key or a Gemini relay API key.
- External endpoints required by the skills you enable.

## Repository Layout

```text
netx-ai/
├── agent-server/      # Go backend, API, ADK runtime, scheduler, skills
├── agent-ui/          # React frontend
├── docs/              # Maintained documentation
├── k8s/               # Kubernetes manifests
├── Dockerfile         # All-in-one image build
└── docker-compose.yml
```

## Backend

```bash
cd agent-server
cp config/app.yaml.example config/app.yaml
go test ./...
go run .
```

The backend listens on `http://127.0.0.1:8080` by default.

Use `logFormat: console` during local development if you prefer readable logs.

## Frontend

```bash
cd agent-ui
npm install
npm run dev
```

The Vite development server runs on:

```text
http://localhost:5173
```

The Vite server proxies API calls to the Go backend.

## Full Local Workflow

Terminal 1:

```bash
cd agent-server
go run .
```

Terminal 2:

```bash
cd agent-ui
npm run dev
```

Open:

```text
http://localhost:5173
```

Create an AgentSpace in the UI, then configure:

- LLM provider.
- Model name.
- API key or relay API key.
- Runtime environment variables required by your skills.
- Optional Enterprise WeChat webhook.

## Build Frontend for Backend Hosting

```bash
cd agent-ui
npm run build

cd ../agent-server
mkdir -p web/dist
cp -r ../agent-ui/dist/* web/dist/
go run .
```

PowerShell:

```powershell
cd agent-ui
npm run build

cd ..\agent-server
New-Item -ItemType Directory -Force web\dist | Out-Null
Copy-Item -Recurse -Force ..\agent-ui\dist\* web\dist
go run .
```

## Tests

Backend:

```bash
cd agent-server
go test ./...
```

Frontend:

```bash
cd agent-ui
npm run build
```

The frontend currently uses the TypeScript compiler and Vite build as the primary validation path.

## Development Notes

- Keep generated binaries out of the repository.
- Keep `agent-server/config/app.yaml` and `agent-server/data/` local.
- Prefer updating docs in the same change that modifies API behavior, configuration, or deployment.
- Avoid logging secrets, webhook URLs, full prompts containing credentials, or private service endpoints.
