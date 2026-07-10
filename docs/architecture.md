# Architecture

NetX AI is an all-in-one self-hosted agent workspace for Chain287 SRE operations.

It combines a Go backend, a React frontend, file-backed persistence, Google ADK-Go based model execution, and a skill runner for operational tools. The default deployment packages the frontend and backend into one container.

## Component Overview

```text
Browser UI
  |
  | HTTP JSON API
  v
Go agent server
  |
  | AgentSpace config, tasks, records, artifacts
  v
File store

Go agent server
  |
  | ADK LLM interface
  v
Gemini or Gemini relay

Go agent server
  |
  | execute_skill_action
  v
Skill runner
  |
  | read-only scripts and tools
  v
Chain287 RPC and local command runtime

Go agent server
  |
  | webhook messages
  v
Enterprise WeChat
```

## Backend

The backend is implemented in Go. It owns:

- HTTP API routing under `/api/v1`.
- Basic auth validation when configured.
- Static frontend hosting from the built Vite output.
- AgentSpace, conversation, task, automation, document, artifact, and record storage.
- ADK runner setup and event capture.
- Scheduled automation registration.
- Enterprise WeChat notifications.

The backend intentionally uses a POST-oriented API style for most application actions. This keeps request bodies consistent and simple for the current UI client.

## Frontend

The frontend is implemented with React, TypeScript, Vite, Tailwind CSS, Radix primitives, and local shadcn-style components.

The UI provides:

- AgentSpace administration.
- Chat workspace.
- Task list and task detail views.
- Automation list and automation detail views.
- Artifact list and preview/download flows.
- Context file upload and management.
- Enterprise WeChat integration setup.

The development server proxies `/api/v1/*` requests to the Go backend.

## AgentSpace

An AgentSpace is the main tenant-like boundary in NetX AI. Each AgentSpace has:

- A name and description.
- LLM configuration.
- Runtime environment variables.
- Integration settings.
- Conversations, tasks, automations, documents, artifacts, and records.

LLM configuration is AgentSpace-scoped. Application-level settings such as `publicURL`, logging, paths, and auth live in `agent-server/config/app.yaml`.

## Model Execution

NetX AI uses Google ADK-Go v2 as the agent runtime. The current model adapter supports:

- `gemini`: direct Gemini API access.
- `google` and `google-ai`: aliases for direct Gemini API access.
- `gemini-relay`: a Gemini-compatible relay endpoint, such as an internal gateway or Tokenstars-compatible relay.

For `gemini-relay`, `baseUrl` must be the relay root URL. Do not include `/v1beta`; the SDK constructs the Gemini native path.

## Skill Execution

Skills live under `agent-server/skills`. The ADK agent discovers skill instructions and invokes `execute_skill_action`, which dispatches to the Go skill runner.

The current skill set focuses on read-only Chain287 inspection:

- `chain287-chain-query`
- `chain287-validator-health`
- `chain287-sre-inspection-report`

Skill-declared artifacts are persisted by the backend so the UI can display and download them.

## Persistence Model

The file store writes human-readable files under the configured agent data directory.

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
│   ├── .meta/{documentId}.yaml
│   └── {documentId}-{filename}
├── artifacts/{artifactId}-{name}
├── memory/memories.jsonl
└── index/*.jsonl
```

This storage model favors easy local inspection and simple backups over high-concurrency database features.

## Automation Flow

1. A user creates an automation with an instruction and schedule.
2. The automation scheduler registers enabled automations on server start and after changes.
3. At trigger time, the scheduler creates a task with `source: automation_schedule`.
4. The task runs through the same ADK and skill path as manual tasks.
5. Records and artifacts are persisted.
6. If Enterprise WeChat is enabled for the AgentSpace, the backend sends a task result notification.

## Notification Flow

Enterprise WeChat is configured per AgentSpace. The application-level `publicURL` is used to build task detail links in notifications.

Notifications are best-effort. A notification failure is recorded on the task but does not change the task result.

## Security Boundaries

- Basic auth is single-user and optional.
- Webhook URLs and API keys are not logged.
- Skills should remain read-only unless a separate approval workflow is implemented.
- The current file store is local to the server process and should be protected by filesystem permissions and backups.

## Non-Goals

NetX AI is not currently:

- A multi-tenant SaaS control plane.
- A general-purpose secret manager.
- A high-availability distributed scheduler.
- A replacement for production incident management or approval systems.
