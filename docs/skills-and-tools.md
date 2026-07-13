# Skills and Tools

Skills define the operational capabilities available to the ADK agent.

NetX AI keeps skill execution explicit. The model does not run arbitrary shell commands directly. It selects a declared skill action, and the backend skill runner executes the configured command with the AgentSpace environment.

## Directory Layout

```text
agent-server/skills/
├── example-health-check/
│   ├── SKILL.md
│   ├── tools.yaml
│   ├── references/
│   └── scripts/
├── example-service-inspection/
│   ├── SKILL.md
│   ├── tools.yaml
│   ├── references/
│   └── scripts/
└── example-report-generator/
    ├── SKILL.md
    ├── tools.yaml
    ├── references/
    └── scripts/
```

## Skill Files

| File | Purpose |
| --- | --- |
| `SKILL.md` | Instructions the agent can load before using the skill. |
| `tools.yaml` | Declared actions, command templates, inputs, and metadata. |
| `references/` | Supporting material for the skill. |
| `scripts/` | Executable scripts called by tool actions. |

## Runtime Flow

1. ADK loads available skills.
2. The model chooses a declared action.
3. The `execute_skill_action` function tool calls the Go skill runner.
4. The runner validates the action against `tools.yaml`.
5. The runner executes the configured script or command.
6. The structured result is recorded.
7. Artifact candidates are persisted when declared by the skill output.

## Environment Variables

The skill runner receives AgentSpace environment variables such as:

- Endpoint variables required by your skills
- Any other AgentSpace-scoped runtime values.

The backend also injects:

- `NETX_ARTIFACT_DIR`
- `NETX_TASK_ID`

Skills should read configuration from environment variables instead of hardcoding endpoints.

## Output Contract

Skill actions should return structured output when possible:

```json
{
  "version": "1",
  "status": "ok",
  "message": "Inspection completed.",
  "data": {},
  "artifacts": [
    {
      "ref": "report.html",
      "name": "sre-inspection.html",
      "mimeType": "text/html",
      "description": "HTML inspection report"
    }
  ],
  "metadata": {
    "skill": "example-report-generator",
    "action": "generate_report"
  }
}
```

The backend stores the result as task records and persists artifact candidates found in the output.

## Safety Policy

Operational skills should be read-only by default:

- Query external system state.
- Inspect service health.
- Generate reports.
- Save artifacts.

They should not:

- Access or print secrets.
- Trigger irreversible external actions without approval.
- Restart services.
- Mutate production state.
- Run privileged infrastructure commands.

Any future write-capable action should require a separate approval workflow and clear audit records.

## Adding a Skill

1. Create a directory under `agent-server/skills`.
2. Add `SKILL.md`.
3. Add `tools.yaml` with declared actions.
4. Place scripts under `scripts/`.
5. Keep scripts deterministic and explicit about required environment variables.
6. Run backend tests.
7. Test through a task in the UI.

## Artifact Tips

- Write large reports to `NETX_ARTIFACT_DIR`.
- Return artifact candidates instead of pasting full file contents into the model response.
- Use stable filenames with task or timestamp context.
- Include a useful MIME type.
