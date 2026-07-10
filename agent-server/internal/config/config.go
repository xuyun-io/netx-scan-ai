package config

import (
	"crypto/subtle"
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Auth holds the single-user basic-auth credentials.
type Auth struct {
	Username string `yaml:"username"`
	Password string `yaml:"password"`
}

// PathConfig groups directory layout settings. Values may be absolute or relative to Root.
type PathConfig struct {
	Root   string `yaml:"root"`
	Agents string `yaml:"agents"`
	Web    string `yaml:"web"`
	Skills string `yaml:"skills"`
}

// Config is the on-disk configuration for the agent server.
type Config struct {
	HTTPAddr  string     `yaml:"httpAddr"`
	Path      PathConfig `yaml:"path"`
	PublicURL string     `yaml:"publicURL"`
	LogLevel  string     `yaml:"logLevel"`
	LogFormat string     `yaml:"logFormat"`
	Auth      Auth       `yaml:"auth"`
}

// DefaultPath returns the default configuration file path.
func DefaultPath() string {
	return filepath.Join(".", "config", "app.yaml")
}

// Defaults fills zero-value fields with their default values.
func (c *Config) Defaults() {
	if c.HTTPAddr == "" {
		c.HTTPAddr = ":8080"
	}
	if c.Path.Root == "" {
		c.Path.Root = "."
	}
	if c.Path.Agents == "" {
		c.Path.Agents = "data/agents"
	}
	if c.Path.Web == "" {
		c.Path.Web = "web/dist"
	}
	if c.Path.Skills == "" {
		c.Path.Skills = "skills"
	}
	if c.LogLevel == "" {
		c.LogLevel = "info"
	}
	if c.LogFormat == "" {
		c.LogFormat = "json"
	}
}

// ResolvePath returns an absolute path. Absolute values are returned as-is;
// relative values are joined with Path.Root.
func (c *Config) ResolvePath(value string) string {
	if filepath.IsAbs(value) {
		return filepath.Clean(value)
	}
	return filepath.Clean(filepath.Join(c.Path.Root, value))
}

// ResolvePaths returns absolute paths for Agents/Web/Skills.
func (c *Config) ResolvePaths() (agentsDir, webDist, skillsDir string) {
	return c.ResolvePath(c.Path.Agents), c.ResolvePath(c.Path.Web), c.ResolvePath(c.Path.Skills)
}

// Load reads the configuration from path. If the file does not exist, it
// returns a config populated with defaults. Malformed files return an error.
func Load(path string) (*Config, error) {
	cfg := &Config{}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			cfg.Defaults()
			return cfg, nil
		}
		return nil, fmt.Errorf("read config %q: %w", path, err)
	}
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("parse config %q: %w", path, err)
	}
	cfg.Defaults()
	return cfg, nil
}

// AuthEnabled reports whether basic auth is configured.
func (c *Config) AuthEnabled() bool {
	return c != nil && c.Auth.Username != "" && c.Auth.Password != ""
}

// ValidateCredentials checks username/password against the configured auth
// using constant-time comparison to mitigate timing attacks.
func (c *Config) ValidateCredentials(username, password string) bool {
	if !c.AuthEnabled() {
		return true
	}
	userOK := subtle.ConstantTimeCompare([]byte(username), []byte(c.Auth.Username)) == 1
	passOK := subtle.ConstantTimeCompare([]byte(password), []byte(c.Auth.Password)) == 1
	return userOK && passOK
}
