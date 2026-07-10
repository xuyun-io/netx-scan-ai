# API Examples

This page contains copyable API examples for common flows.

All examples assume:

```text
BASE_URL=http://127.0.0.1:8080
AGENT_SPACE=demo
```

## List AgentSpaces

```bash
curl -X POST "$BASE_URL/api/v1/listAgentSpaces" \
  -H 'content-type: application/json' \
  -d '{}'
```

## Create a Conversation

```bash
curl -X POST "$BASE_URL/api/v1/createConversation" \
  -H 'content-type: application/json' \
  -d '{
    "agentSpaceName": "demo",
    "title": "Chain287 inspection"
  }'
```

## Run a Chat Turn

```bash
curl -X POST "$BASE_URL/api/v1/createTurn" \
  -H 'content-type: application/json' \
  -d '{
    "agentSpaceName": "demo",
    "conversationId": "conversation-...",
    "prompt": "Check the latest Chain287 block and summarize the result."
  }'
```

Poll:

```bash
curl -X POST "$BASE_URL/api/v1/getTurn" \
  -H 'content-type: application/json' \
  -d '{
    "agentSpaceName": "demo",
    "conversationId": "conversation-...",
    "turnId": "turn-..."
  }'
```

## Create a Manual Task

```bash
curl -X POST "$BASE_URL/api/v1/createTask" \
  -H 'content-type: application/json' \
  -d '{
    "agentSpaceName": "demo",
    "name": "Generate inspection report",
    "priority": "normal",
    "type": "inspection",
    "source": "manual",
    "instruction": "Run the Chain287 SRE inspection report and save the artifact."
  }'
```

## Approve a Task

```bash
curl -X POST "$BASE_URL/api/v1/respondToTask" \
  -H 'content-type: application/json' \
  -d '{
    "agentSpaceName": "demo",
    "taskId": "task-...",
    "response": "approve",
    "userId": "operator"
  }'
```

## Cancel a Task

```bash
curl -X POST "$BASE_URL/api/v1/cancelTask" \
  -H 'content-type: application/json' \
  -d '{
    "agentSpaceName": "demo",
    "taskId": "task-..."
  }'
```

## Trigger an Automation Once

```bash
curl -X POST "$BASE_URL/api/v1/triggerAutomation" \
  -H 'content-type: application/json' \
  -d '{
    "agentSpaceName": "demo",
    "automationId": "automation-..."
  }'
```

## List Records for a Task

```bash
curl -X POST "$BASE_URL/api/v1/listRecords" \
  -H 'content-type: application/json' \
  -d '{
    "agentSpaceName": "demo",
    "taskId": "task-...",
    "maxResults": 100
  }'
```
