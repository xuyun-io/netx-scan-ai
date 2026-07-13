# Deployment

NetX AI is designed to run as an all-in-one service: the Go backend serves the built React frontend and exposes the JSON API.

## Docker Compose

Create a config file:

```bash
cp agent-server/config/app.yaml.example agent-server/config/app.yaml
```

For Docker Compose, use `/app` as `path.root`:

```yaml
httpAddr: :8080
path:
  root: /app
  agents: data/agents
  web: web/dist
  skills: skills
publicURL: https://netx-agent.example.com
logLevel: info
logFormat: json

auth:
  username: admin
  password: replace-with-a-strong-password
```

Start the service:

```bash
docker compose up --build -d
```

Open:

```text
http://localhost:8080
```

## Container Layout

The image contains:

- `/app/netx-sre-agent`: Go server binary.
- `/app/web/dist`: built frontend.
- `/app/skills`: bundled skills.
- Additional command-line tools required by bundled example skills.

The Compose file mounts:

- `./agent-server/data/agents:/app/data/agents`
- `./agent-server/skills:/app/skills:ro`
- `./agent-server/config/app.yaml:/app/config/app.yaml:ro`

## Production Checklist

Before exposing the service to users:

- Set `publicURL` to a URL users and Enterprise WeChat recipients can open.
- Enable Basic auth.
- Use `logFormat: json`.
- Back up `agent-server/data/agents`.
- Do not commit `agent-server/config/app.yaml`.
- Do not commit real API keys, webhook URLs, or private service endpoints.
- Put the service behind HTTPS when reachable outside a trusted network.
- Confirm external endpoints required by your skills are reachable from the container.
- Confirm scheduled automation notifications include valid task links.

## Kubernetes

The `k8s/` directory contains a basic deployment and PVC manifest. Treat them as a starting point:

- Mount the config file as a ConfigMap or Secret.
- Mount the agent data directory on a persistent volume.
- Expose the service behind an ingress with TLS.
- Set `publicURL` to the ingress URL.
- Keep webhook URLs and API keys in secrets or AgentSpace configuration with restricted access.

## Upgrades

For file-backed deployments:

1. Stop the service.
2. Back up `agent-server/data/agents`.
3. Build or pull the new image.
4. Start the service.
5. Check `/api/v1/healthz`.
6. Open the UI and verify AgentSpaces, tasks, automations, and artifacts.

There is no database migration system at this stage. Keep backups before upgrades.
