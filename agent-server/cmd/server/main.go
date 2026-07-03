package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/agent"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/api"
	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/store"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	dataDir := getenv("NETX_DATA_DIR", filepath.Join(".", "data", "agents"))
	webDist := getenv("NETX_WEB_DIST", filepath.Join(".", "web", "dist"))
	addr := getenv("NETX_HTTP_ADDR", ":8080")

	fileStore := store.New(dataDir)
	agentService := agent.NewService(fileStore)
	server := &http.Server{
		Addr:              addr,
		Handler:           api.New(fileStore, agentService, webDist).Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		slog.Info("starting NetX SRE Agent server", "addr", addr, "dataDir", dataDir, "webDist", webDist)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server failed", "error", err)
			os.Exit(1)
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		slog.Error("graceful shutdown failed", "error", err)
		os.Exit(1)
	}
	slog.Info("server stopped")
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
