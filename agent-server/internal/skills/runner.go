package skills

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

const defaultTimeout = 30 * time.Second

var skillNamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$`)

type Config struct {
	RootDir string
}

type Runner struct {
	rootDir string
}

type ActionResult struct {
	Skill       string              `json:"skill"`
	Action      string              `json:"action"`
	Description string              `json:"description,omitempty"`
	Command     string              `json:"command,omitempty"`
	ReadOnly    bool                `json:"readonly"`
	Approval    bool                `json:"approval"`
	Stdout      string              `json:"stdout,omitempty"`
	Stderr      string              `json:"stderr,omitempty"`
	Output      *SkillOutput        `json:"output,omitempty"`
	Artifacts   []ArtifactCandidate `json:"artifacts,omitempty"`
	Duration    time.Duration       `json:"duration"`
	ExitCode    int                 `json:"exitCode"`
}

type manifest struct {
	Version string            `yaml:"version"`
	Actions map[string]action `yaml:"actions"`
}

type action struct {
	Description    string            `yaml:"description"`
	Command        string            `yaml:"command"`
	Args           []string          `yaml:"args"`
	Env            map[string]string `yaml:"env"`
	ReadOnly       bool              `yaml:"readonly"`
	Approval       bool              `yaml:"approval"`
	TimeoutSeconds int               `yaml:"timeoutSeconds"`
}

func NewRunner(cfg Config) *Runner {
	root := cfg.RootDir
	if root == "" {
		root = DefaultRootDir()
	}
	return &Runner{rootDir: root}
}

func DefaultRootDir() string {
	for _, candidate := range []string{
		"skills",
		filepath.Join("..", "..", "skills"),
		filepath.Join("netx-ai", "agent-server", "skills"),
	} {
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return candidate
		}
	}
	return "skills"
}

func (r *Runner) RootDir() string {
	return r.rootDir
}

func (r *Runner) Run(ctx context.Context, skillName, actionName string, vars map[string]string) (ActionResult, error) {
	return r.RunWithEnv(ctx, skillName, actionName, vars, nil)
}

func (r *Runner) RunWithEnv(ctx context.Context, skillName, actionName string, vars map[string]string, extraEnv map[string]string) (ActionResult, error) {
	result := ActionResult{Skill: skillName, Action: actionName, ExitCode: -1}
	if !validName(skillName) {
		return result, fmt.Errorf("invalid skill name %q", skillName)
	}
	if !validActionName(actionName) {
		return result, fmt.Errorf("invalid action name %q", actionName)
	}

	skillDir, err := r.skillDir(skillName)
	if err != nil {
		return result, err
	}
	manifest, err := loadManifest(skillDir)
	if err != nil {
		return result, err
	}
	action, ok := manifest.Actions[actionName]
	if !ok {
		return result, fmt.Errorf("skill %q action %q not found", skillName, actionName)
	}
	if action.Command == "" {
		return result, fmt.Errorf("skill %q action %q command is required", skillName, actionName)
	}
	if !action.ReadOnly {
		return result, fmt.Errorf("skill %q action %q is not marked readonly and cannot be executed by the read-only runner", skillName, actionName)
	}
	if action.Approval {
		return result, fmt.Errorf("skill %q action %q requires approval and cannot be executed by the read-only runner", skillName, actionName)
	}

	timeout := defaultTimeout
	if action.TimeoutSeconds > 0 {
		timeout = time.Duration(action.TimeoutSeconds) * time.Second
	}
	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	command, args, err := prepareCommand(skillDir, action, vars)
	if err != nil {
		return result, err
	}
	cmd := exec.CommandContext(runCtx, command, args...)
	cmd.Dir = skillDir
	cmd.Env = buildEnv(action.Env, vars, extraEnv)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	start := time.Now()
	runErr := cmd.Run()
	duration := time.Since(start)

	cleanStdout := sanitize(stdout.String(), cmd.Env)
	cleanStderr := sanitize(stderr.String(), cmd.Env)
	result.Description = action.Description
	result.Command = action.Command
	result.ReadOnly = action.ReadOnly
	result.Approval = action.Approval
	result.Stdout = strings.TrimSpace(cleanStdout)
	result.Stderr = strings.TrimSpace(cleanStderr)
	result.Duration = duration
	result.ExitCode = exitCode(runErr)
	result.Output = NormalizeSkillOutput(result.Stdout, result.Stderr, result.ExitCode, OutputMetadataFromResult(result, start))
	if result.Output != nil {
		result.Artifacts = result.Output.Artifacts
	}

	if errors.Is(runCtx.Err(), context.DeadlineExceeded) {
		return result, fmt.Errorf("skill %q action %q timed out after %s", skillName, actionName, timeout)
	}
	if runErr != nil {
		if result.Stderr != "" {
			return result, fmt.Errorf("skill %q action %q failed: %s", skillName, actionName, result.Stderr)
		}
		return result, fmt.Errorf("skill %q action %q failed: %w", skillName, actionName, runErr)
	}
	return result, nil
}

func (r *Runner) skillDir(name string) (string, error) {
	root, err := filepath.Abs(r.rootDir)
	if err != nil {
		return "", err
	}
	dir, err := filepath.Abs(filepath.Join(root, name))
	if err != nil {
		return "", err
	}
	if !inside(root, dir) {
		return "", fmt.Errorf("skill path escapes root")
	}
	if info, err := os.Stat(dir); err != nil || !info.IsDir() {
		if err == nil {
			err = fmt.Errorf("%s is not a directory", dir)
		}
		return "", fmt.Errorf("skill %q not available under %s: %w", name, root, err)
	}
	return dir, nil
}

func loadManifest(skillDir string) (manifest, error) {
	var m manifest
	data, err := os.ReadFile(filepath.Join(skillDir, "tools.yaml"))
	if err != nil {
		return m, err
	}
	if err := yaml.Unmarshal(data, &m); err != nil {
		return m, err
	}
	if len(m.Actions) == 0 {
		return m, fmt.Errorf("tools.yaml has no actions")
	}
	return m, nil
}

func prepareCommand(skillDir string, a action, vars map[string]string) (string, []string, error) {
	command := substitute(a.Command, vars)
	args := make([]string, 0, len(a.Args)+1)
	for _, arg := range a.Args {
		args = append(args, substitute(arg, vars))
	}

	if looksLikePath(command) {
		resolved := command
		if !filepath.IsAbs(resolved) {
			resolved = filepath.Join(skillDir, resolved)
		}
		abs, err := filepath.Abs(resolved)
		if err != nil {
			return "", nil, err
		}
		if !inside(skillDir, abs) {
			return "", nil, fmt.Errorf("command path escapes skill directory")
		}
		ext := strings.ToLower(filepath.Ext(abs))
		switch ext {
		case ".sh":
			return "sh", append([]string{abs}, args...), nil
		case ".js":
			return "node", append([]string{abs}, args...), nil
		default:
			return abs, args, nil
		}
	}
	return command, args, nil
}

func buildEnv(actionEnv map[string]string, vars map[string]string, extraEnv map[string]string) []string {
	env := envMap(os.Environ())
	for key, value := range actionEnv {
		if key == "" {
			continue
		}
		env[key] = substitute(value, vars)
	}
	for key, value := range extraEnv {
		if key == "" {
			continue
		}
		env[key] = value
	}
	for key, value := range vars {
		if strings.HasPrefix(key, "ENV_") {
			env[strings.TrimPrefix(key, "ENV_")] = value
		}
	}
	return flattenEnv(env)
}

func envMap(entries []string) map[string]string {
	env := make(map[string]string, len(entries))
	for _, entry := range entries {
		key, value, ok := strings.Cut(entry, "=")
		if !ok || key == "" {
			continue
		}
		env[key] = value
	}
	return env
}

func flattenEnv(env map[string]string) []string {
	entries := make([]string, 0, len(env))
	for key, value := range env {
		entries = append(entries, key+"="+value)
	}
	return entries
}

func substitute(value string, vars map[string]string) string {
	out := value
	for key, val := range vars {
		out = strings.ReplaceAll(out, "${"+key+"}", val)
	}
	return os.Expand(out, func(key string) string {
		if val, ok := vars[key]; ok {
			return val
		}
		return os.Getenv(key)
	})
}

func exitCode(err error) int {
	if err == nil {
		return 0
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return exitErr.ExitCode()
	}
	return -1
}

func sanitize(output string, env []string) string {
	clean := output
	for _, entry := range env {
		key, value, ok := strings.Cut(entry, "=")
		if !ok || value == "" || len(value) < 6 {
			continue
		}
		if isSecretKey(key) {
			clean = strings.ReplaceAll(clean, value, "***")
		}
	}
	return clean
}

func isSecretKey(key string) bool {
	key = strings.ToUpper(key)
	for _, marker := range []string{"KEY", "SECRET", "TOKEN", "PASSWORD", "RPC_URL"} {
		if strings.Contains(key, marker) {
			return true
		}
	}
	return false
}

func validName(name string) bool {
	return skillNamePattern.MatchString(name) && !strings.Contains(name, "--")
}

func validActionName(name string) bool {
	if name == "" || len(name) > 64 {
		return false
	}
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			continue
		}
		return false
	}
	return true
}

func looksLikePath(command string) bool {
	return strings.Contains(command, "/") || strings.Contains(command, `\`) || strings.HasPrefix(command, ".")
}

func inside(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	if err != nil {
		return false
	}
	return rel == "." || (!strings.HasPrefix(rel, "..") && !filepath.IsAbs(rel))
}
