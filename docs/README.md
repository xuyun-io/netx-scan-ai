# NetX AI Documentation

This directory contains the maintained documentation for NetX AI.

The structure follows the style used by mature open-source AI projects: a short project README for orientation, a quick start path, separate operational guides, and focused reference pages instead of long design notes mixed with setup instructions.

## Start Here

| Document | Use it for |
| --- | --- |
| [Architecture](architecture.md) | System boundaries, runtime flow, persistence, and component responsibilities. |
| [Configuration](configuration.md) | Application config, AgentSpace config, model providers, auth, and environment variables. |
| [Development](development.md) | Local backend and frontend development workflow. |
| [Deployment](deployment.md) | Docker Compose, container paths, volumes, and production checklist. |
| [API Reference](api.md) | HTTP API conventions and endpoint groups. |
| [Skills and Tools](skills-and-tools.md) | Skill layout, tool execution, artifact handling, and runtime environment. |
| [Integrations](integrations.md) | Enterprise WeChat setup and notification behavior. |
| [Operations](operations.md) | Logs, health checks, backups, troubleshooting, and security notes. |
| [Documentation References](references.md) | Open-source documentation patterns used as reference material. |

## Audience

- Operators running NetX AI for inspection, reporting, and scheduled automation.
- Developers extending backend APIs, frontend workspace views, skills, and integrations.
- Platform teams packaging the all-in-one service into Docker or Kubernetes environments.

## Documentation Rules

- Keep user-facing documentation in English.
- Prefer task-oriented pages over historical analysis notes.
- Keep configuration examples copyable and explicit.
- Do not include secrets, real webhook URLs, private service endpoints, or API keys.
- When implementation changes, update the closest reference page in the same pull request.

## Current Scope

NetX AI is a self-hosted SRE agent workspace. It currently includes:

- Multi-AgentSpace management.
- Chat conversations and turn records.
- Manual tasks and scheduled automations.
- ADK-backed Gemini model execution.
- Gemini relay support for compatible proxy gateways.
- File-backed persistence for agent data, task records, documents, and artifacts.
- Skill execution for read-only inspection and reporting workflows.
- Enterprise WeChat webhook notifications and system tool access.
