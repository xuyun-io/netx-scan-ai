package skills

import (
	"context"
	"fmt"
	"time"

	adkagent "google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

const ExecuteActionToolName = "execute_skill_action"

type ExecuteActionInput struct {
	Skill  string            `json:"skill" jsonschema:"Skill directory name, for example chain287-chain-query."`
	Action string            `json:"action" jsonschema:"Action name declared in the skill tools.yaml file."`
	Vars   map[string]string `json:"vars,omitempty" jsonschema:"Optional action variables. Keys prefixed with ENV_ are exposed as environment variables."`
}

type ExecuteActionOutput struct {
	Skill          string         `json:"skill"`
	Action         string         `json:"action"`
	Description    string         `json:"description,omitempty"`
	Command        string         `json:"command,omitempty"`
	ReadOnly       bool           `json:"readonly"`
	Approval       bool           `json:"approval"`
	Stdout         string         `json:"stdout,omitempty"`
	Stderr         string         `json:"stderr,omitempty"`
	JSON           map[string]any `json:"json,omitempty"`
	ExitCode       int            `json:"exitCode"`
	DurationMillis int64          `json:"durationMillis"`
}

func NewExecuteActionTool(runner *Runner) (tool.Tool, error) {
	return NewExecuteActionToolWithEnv(runner, nil)
}

func NewExecuteActionToolWithEnv(runner *Runner, extraEnv map[string]string) (tool.Tool, error) {
	if runner == nil {
		return nil, fmt.Errorf("skill runner is required")
	}
	toolEnv := cloneStringMap(extraEnv)
	return functiontool.New(
		functiontool.Config{
			Name:        ExecuteActionToolName,
			Description: "Execute one declared action from a loaded skill's tools.yaml. Use this after loading the relevant skill instructions. The host executes only declared actions and rejects actions that require approval until approval workflow support is wired.",
		},
		func(ctx adkagent.Context, input ExecuteActionInput) (ExecuteActionOutput, error) {
			return ExecuteActionWithEnv(ctx, runner, input, toolEnv)
		},
	)
}

func RunDeclaredAction(ctx context.Context, runner *Runner, input ExecuteActionInput) (ActionResult, error) {
	return RunDeclaredActionWithEnv(ctx, runner, input, nil)
}

func RunDeclaredActionWithEnv(ctx context.Context, runner *Runner, input ExecuteActionInput, extraEnv map[string]string) (ActionResult, error) {
	if runner == nil {
		return ActionResult{}, fmt.Errorf("skill runner is required")
	}
	if input.Skill == "" {
		return ActionResult{}, fmt.Errorf("skill is required")
	}
	if input.Action == "" {
		return ActionResult{}, fmt.Errorf("action is required")
	}
	return runner.RunWithEnv(ctx, input.Skill, input.Action, input.Vars, extraEnv)
}

func ExecuteAction(ctx context.Context, runner *Runner, input ExecuteActionInput) (ExecuteActionOutput, error) {
	return ExecuteActionWithEnv(ctx, runner, input, nil)
}

func ExecuteActionWithEnv(ctx context.Context, runner *Runner, input ExecuteActionInput, extraEnv map[string]string) (ExecuteActionOutput, error) {
	result, err := RunDeclaredActionWithEnv(ctx, runner, input, extraEnv)
	output := ExecuteActionOutputFromResult(result)
	return output, err
}

func ExecuteActionOutputFromResult(result ActionResult) ExecuteActionOutput {
	return ExecuteActionOutput{
		Skill:          result.Skill,
		Action:         result.Action,
		Description:    result.Description,
		Command:        result.Command,
		ReadOnly:       result.ReadOnly,
		Approval:       result.Approval,
		Stdout:         result.Stdout,
		Stderr:         result.Stderr,
		JSON:           result.JSON,
		ExitCode:       result.ExitCode,
		DurationMillis: result.Duration.Round(time.Millisecond).Milliseconds(),
	}
}

func cloneStringMap(values map[string]string) map[string]string {
	if len(values) == 0 {
		return nil
	}
	cloned := make(map[string]string, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}
