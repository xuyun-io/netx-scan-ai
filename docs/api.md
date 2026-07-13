# API Reference

The backend exposes a JSON API under `/api/v1`.

Most endpoints use `POST` with JSON request bodies. `GET /api/v1/healthz` is supported for health checks.

## Conventions

### Request Headers

```http
content-type: application/json
authorization: Basic <credentials>
```

The `authorization` header is required only when Basic auth is enabled.

### Entity Response

Single-object responses use:

```json
{
  "entity": {}
}
```

List responses use:

```json
{
  "entities": [],
  "nextToken": ""
}
```

Errors use a JSON error response with an HTTP status code.

### Async Execution

These endpoints start asynchronous work and return before execution is complete:

- `createTurn`
- `createTask`
- `triggerAutomation`

Use `getTurn`, `getTask`, `listRecords`, and `listArtifacts` to observe progress and results.

## Endpoint Groups

### System

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/v1/healthz` | GET or POST | Health check. |
| `/api/v1/login` | POST | Validate Basic auth credentials. |

### AgentSpaces

| Endpoint | Purpose |
| --- | --- |
| `/api/v1/createAgentSpace` | Create an AgentSpace. |
| `/api/v1/listAgentSpaces` | List AgentSpaces. |
| `/api/v1/getAgentSpace` | Get one AgentSpace. |
| `/api/v1/updateAgentSpace` | Update LLM, environment, description, and integrations. |
| `/api/v1/deleteAgentSpace` | Delete an AgentSpace. |

### Conversations

| Endpoint | Purpose |
| --- | --- |
| `/api/v1/createConversation` | Create a chat conversation. |
| `/api/v1/listConversations` | List conversations in an AgentSpace. |
| `/api/v1/getConversation` | Get one conversation. |
| `/api/v1/deleteConversation` | Delete a conversation. |
| `/api/v1/createTurn` | Add a prompt turn and start model execution. |
| `/api/v1/getTurn` | Get turn status and output. |

### Tasks

| Endpoint | Purpose |
| --- | --- |
| `/api/v1/createTask` | Create a manual or pre-authorized task. |
| `/api/v1/getTask` | Get task status and output. |
| `/api/v1/listTasks` | List tasks in an AgentSpace. |
| `/api/v1/deleteTask` | Delete a task. |
| `/api/v1/respondToTask` | Approve or reject a task awaiting input. |
| `/api/v1/cancelTask` | Cancel a pending or running task. |

### Automations

| Endpoint | Purpose |
| --- | --- |
| `/api/v1/createAutomation` | Create a scheduled automation. |
| `/api/v1/listAutomations` | List automations. |
| `/api/v1/getAutomation` | Get one automation. |
| `/api/v1/updateAutomation` | Update schedule, content, or enabled state. |
| `/api/v1/deleteAutomation` | Delete an automation. |
| `/api/v1/triggerAutomation` | Run an automation once. |

### Records

| Endpoint | Purpose |
| --- | --- |
| `/api/v1/listRecords` | List task, turn, or conversation records. |

### Artifacts

| Endpoint | Purpose |
| --- | --- |
| `/api/v1/listArtifacts` | List artifacts in an AgentSpace. |
| `/api/v1/getArtifact` | Get artifact metadata and content URL details. |
| `/api/v1/deleteArtifact` | Delete an artifact. |

### Context Files

| Endpoint | Purpose |
| --- | --- |
| `/api/v1/createDocument` | Upload a context file. |
| `/api/v1/listDocuments` | List context files. |
| `/api/v1/getDocument` | Get context file metadata. |
| `/api/v1/deleteDocument` | Soft-delete a context file. |

## Examples

### Create AgentSpace

```bash
curl -X POST http://127.0.0.1:8080/api/v1/createAgentSpace \
  -H 'content-type: application/json' \
  -d '{
    "name": "demo",
    "description": "SRE operations workspace",
    "llm": {
      "provider": "gemini",
      "model": "gemini-2.5-pro",
      "apiKey": "replace-me"
    },
    "environment": {
      "SERVICE_ENDPOINT_URL": "https://service.example.com"
    }
  }'
```

### Create AgentSpace with Gemini Relay

```bash
curl -X POST http://127.0.0.1:8080/api/v1/createAgentSpace \
  -H 'content-type: application/json' \
  -d '{
    "name": "demo-relay",
    "llm": {
      "provider": "gemini-relay",
      "model": "gemini-2.5-pro",
      "apiKey": "replace-me",
      "baseUrl": "https://relay.example.com"
    },
    "environment": {
      "SERVICE_ENDPOINT_URL": "https://service.example.com"
    }
  }'
```

### Create Turn

```bash
curl -X POST http://127.0.0.1:8080/api/v1/createTurn \
  -H 'content-type: application/json' \
  -d '{
    "agentSpaceName": "demo",
    "conversationId": "conversation-...",
    "prompt": "Check service health and summarize any notable issues."
  }'
```

### Create Automation

```bash
curl -X POST http://127.0.0.1:8080/api/v1/createAutomation \
  -H 'content-type: application/json' \
  -d '{
    "agentSpaceName": "demo",
    "name": "Daily infrastructure inspection",
    "instruction": "Run the SRE inspection report and save the HTML artifact.",
    "schedule": {
      "frequency": "daily",
      "interval": 1,
      "hour": 9,
      "minute": 0,
      "timezone": "Asia/Shanghai"
    }
  }'
```
