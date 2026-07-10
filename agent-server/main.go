package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/agent"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/api"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/automation"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/config"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/logging"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/store"
	"go.uber.org/zap"
)

func main() {
	cfgPath := config.DefaultPath()
	cfg, err := config.Load(cfgPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load config %q: %v\n", cfgPath, err)
		os.Exit(1)
	}

	logger, err := logging.Configure("netx-sre-agent", logging.Config{
		Level:  cfg.LogLevel,
		Format: cfg.LogFormat,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to configure logging: %v\n", err)
		os.Exit(1)
	}
	defer func() { _ = logger.Sync() }()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	agentsDir, webDist, skillsDir := cfg.ResolvePaths()
	fileStore := store.New(agentsDir)
	agentService := agent.NewService(fileStore, cfg.PublicURL, skillsDir)
	automationService := automation.NewService(fileStore, agentService)
	if err := automationService.Start(ctx); err != nil {
		logger.Error("automation scheduler failed to start", zap.Error(err))
		os.Exit(1)
	}
	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           api.NewWithConfig(fileStore, agentService, webDist, cfg, automationService).Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		logger.Info("starting NetX SRE Agent server",
			zap.String("addr", cfg.HTTPAddr),
			zap.String("data_dir", agentsDir),
			zap.String("web_dist", webDist),
			zap.String("skills_dir", skillsDir),
			zap.String("config_path", cfgPath),
			zap.Bool("auth_enabled", cfg.AuthEnabled()),
			zap.Bool("public_url_configured", cfg.PublicURL != ""),
		)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server failed", zap.Error(err))
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	logger.Info("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	automationService.Stop(shutdownCtx)
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", zap.Error(err))
		os.Exit(1)
	}
	logger.Info("server stopped")
}
