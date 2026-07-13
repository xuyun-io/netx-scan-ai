package localtrace

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/skills"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/plugin"
	"google.golang.org/adk/v2/tool"
)

type PluginConfig struct {
	Repository Repository
	Scope      Scope
}

// NewPlugin captures the full execute_skill_action result locally and returns
// a smaller projection to ADK. The local trace is observability data; a trace
// write failure never fails or changes the underlying tool execution.
func NewPlugin(cfg PluginConfig) (*plugin.Plugin, error) {
	if cfg.Repository == nil {
		return nil, fmt.Errorf("local trace repository is required")
	}
	var starts sync.Map
	return plugin.New(plugin.Config{
		Name: "NetXLocalToolTrace",
		BeforeToolCallback: func(ctx agent.Context, t tool.Tool, args map[string]any) (map[string]any, error) {
			if t.Name() == skills.ExecuteActionToolName {
				starts.Store(ctx.FunctionCallID(), time.Now().UTC())
			}
			return nil, nil
		},
		AfterToolCallback: func(ctx agent.Context, t tool.Tool, args, result map[string]any, toolErr error) (map[string]any, error) {
			if t.Name() != skills.ExecuteActionToolName || result == nil {
				return nil, nil
			}
			rawBytes := jsonSize(result)
			modelBytes := jsonSize(ProjectForModel(result, ""))
			now := time.Now().UTC()
			durationMillis := int64Value(result["durationMillis"])
			startedAt := now.Add(-time.Duration(durationMillis) * time.Millisecond)
			if value, ok := starts.LoadAndDelete(ctx.FunctionCallID()); ok {
				startedAt = value.(time.Time)
				if durationMillis == 0 {
					durationMillis = now.Sub(startedAt).Milliseconds()
				}
			}
			skill, action, status := resultIdentity(result)
			record := ToolRecord{
				Version:        "1.0",
				Scope:          cfg.Scope,
				InvocationID:   ctx.InvocationID(),
				FunctionCallID: ctx.FunctionCallID(),
				AgentName:      ctx.AgentName(),
				ToolName:       t.Name(),
				Skill:          skill,
				Action:         action,
				Status:         status,
				Request:        cloneMap(args),
				Response:       cloneMap(result),
				Error:          errorText(toolErr),
				RawBytes:       rawBytes,
				ModelBytes:     modelBytes,
				StartedAt:      startedAt,
				CompletedAt:    now,
				DurationMillis: durationMillis,
				CreatedAt:      now,
			}
			ref, saveErr := cfg.Repository.SaveToolRecord(ctx, record)
			compact := ProjectForModel(result, ref.Ref)
			if saveErr != nil {
				// Keep the token-saving projection even when local persistence fails,
				// but omit a reference that cannot be loaded by the UI.
				compact = ProjectForModel(result, "")
				log.Printf("local tool trace persistence failed: invocation=%s function_call=%s error=%v", ctx.InvocationID(), ctx.FunctionCallID(), saveErr)
			} else {
				// A report renderer can use this short invocation reference to load
				// every upstream result without the model copying their JSON.
				compact["traceRef"] = strings.SplitN(ref.Ref, "/", 2)[0]
			}
			return compact, nil
		},
		OnToolErrorCallback: func(ctx agent.Context, t tool.Tool, args map[string]any, toolErr error) (map[string]any, error) {
			if t.Name() != skills.ExecuteActionToolName {
				return nil, nil
			}
			now := time.Now().UTC()
			startedAt := now
			if value, ok := starts.LoadAndDelete(ctx.FunctionCallID()); ok {
				startedAt = value.(time.Time)
			}
			record := ToolRecord{
				Version: "1.0", Scope: cfg.Scope, InvocationID: ctx.InvocationID(), FunctionCallID: ctx.FunctionCallID(),
				AgentName: ctx.AgentName(), ToolName: t.Name(), Skill: stringValue(args["skill"]), Action: stringValue(args["action"]),
				Status: "error", Request: cloneMap(args), Error: errorText(toolErr), StartedAt: startedAt, CompletedAt: now,
				DurationMillis: now.Sub(startedAt).Milliseconds(), CreatedAt: now,
			}
			if _, err := cfg.Repository.SaveToolRecord(ctx, record); err != nil {
				log.Printf("local failed tool trace persistence failed: invocation=%s function_call=%s error=%v", ctx.InvocationID(), ctx.FunctionCallID(), err)
			}
			return nil, nil
		},
	})
}

// ProjectForModel removes fields that duplicate output or only describe host
// execution. The normalized SkillOutput remains intact in this first phase.
func ProjectForModel(result map[string]any, rawResultRef string) map[string]any {
	compact := make(map[string]any, len(result))
	for key, value := range result {
		switch key {
		case "stdout", "stderr", "command", "description", "readonly", "approval":
			continue
		default:
			compact[key] = value
		}
	}
	if rawResultRef != "" {
		compact["rawResultRef"] = rawResultRef
	}
	return compact
}

func cloneMap(value map[string]any) map[string]any {
	data, err := json.Marshal(value)
	if err != nil {
		return value
	}
	var cloned map[string]any
	if err := json.Unmarshal(data, &cloned); err != nil {
		return value
	}
	return cloned
}

func jsonSize(value any) int {
	data, _ := json.Marshal(value)
	return len(data)
}

func errorText(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func resultIdentity(result map[string]any) (string, string, string) {
	skill, action, status := stringValue(result["skill"]), stringValue(result["action"]), "ok"
	if output, ok := result["output"].(map[string]any); ok {
		if value := stringValue(output["status"]); value != "" {
			status = value
		}
	}
	return skill, action, status
}

func stringValue(value any) string {
	result, _ := value.(string)
	return result
}

func int64Value(value any) int64 {
	switch number := value.(type) {
	case int64:
		return number
	case int:
		return int64(number)
	case float64:
		return int64(number)
	default:
		return 0
	}
}
