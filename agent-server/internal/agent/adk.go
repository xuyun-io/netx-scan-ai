package agent

import (
	"context"
	"os"

	appmodel "gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/model"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/skills"
	adkagent "google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	adkmodel "google.golang.org/adk/v2/model"
	adktool "google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/skilltoolset"
	"google.golang.org/adk/v2/tool/skilltoolset/skill"
)

// ADKAgent marks the Google ADK-Go v2 runner boundary used by Service.
// HTTP and FileStore code stay outside ADK while turns and tasks execute through
// ADK agents, tools, and skill toolsets.
type ADKAgent = adkagent.Agent

// ADKSkillToolset is the official ADK-Go v2 toolset used by an LLM agent to
// discover skills and load their instructions/resources from the filesystem.
type ADKSkillToolset = skilltoolset.SkillToolset

func NewADKSkillToolset(ctx context.Context, rootDir string) (*ADKSkillToolset, error) {
	source := skill.NewFileSystemSource(os.DirFS(rootDir))
	return skilltoolset.New(ctx, skilltoolset.Config{
		Source: source,
		Name:   "NetXSkillToolset",
	})
}

func NewADKChainAgent(ctx context.Context, model adkmodel.LLM, rootDir string, runner *skills.Runner) (ADKAgent, error) {
	return NewADKChainAgentWithEnv(ctx, model, rootDir, runner, nil)
}

func NewADKChainAgentWithEnv(ctx context.Context, model adkmodel.LLM, rootDir string, runner *skills.Runner, env appmodel.EnvVars, extraTools ...adktool.Tool) (ADKAgent, error) {
	if runner == nil {
		runner = skills.NewRunner(skills.Config{RootDir: rootDir})
	}
	if rootDir == "" {
		rootDir = runner.RootDir()
	}
	skillToolset, err := NewADKSkillToolset(ctx, rootDir)
	if err != nil {
		return nil, err
	}
	executeActionTool, err := skills.NewExecuteActionToolWithEnv(runner, map[string]string(env))
	if err != nil {
		return nil, err
	}
	tools := []adktool.Tool{executeActionTool}
	tools = append(tools, extraTools...)
	return llmagent.New(llmagent.Config{
		Name:        "netx_chain287_agent",
		Model:       model,
		Description: "NetX Chain287 SRE agent that can use hot-loaded Agent Skills for read-only on-chain queries.",
		Instruction: "You are the NetX Chain287 SRE agent. For Chain287 on-chain and validator operations, stay read-only by default: never send transactions, import private keys, unlock accounts, mutate files, restart nodes, or run SSM/docker commands unless a separate approved workflow explicitly exists.\n\nFor Chain287 queries, first inspect available skills, load the relevant skill instructions, then call execute_skill_action with a declared action from tools.yaml. If the user asks what they can ask, asks for common commands, or seems new to the chain, load chain287-chain-query and call command_catalog before suggesting next prompts.\n\nWhen a tool returns, its result contains a structured 'output' envelope: {version, status, message, data, error, display, artifacts, metadata}. Prefer the 'message' field when answering the user. If status is 'error', clearly explain the failure using the 'error.code' and 'error.detail' fields. Use 'data' for precise facts (numbers, addresses, lists), and summarize tables in Chinese when useful. Keep chain query answers concise and preserve raw tool output for records.\n\nIf send_wecom_message is available, it sends to the Enterprise WeChat group configured by the host. Never ask for, reveal, or include webhook URLs. Use it only for user-requested notifications or important task/automation updates, and keep the message concise.\n\nSkill-declared artifacts are persisted by the host automatically. For concise model-generated text reports, use save_artifact_text. Do not paste large file contents into the final answer. Use list_artifacts and load_artifact_preview when you need to refer to saved artifacts.",
		Tools:       tools,
		Toolsets:    []adktool.Toolset{skillToolset},
	})
}
