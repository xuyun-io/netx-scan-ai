# syntax=docker/dockerfile:1

FROM node:24-alpine AS ui-builder
WORKDIR /app/agent-ui
COPY agent-ui/package*.json ./
RUN npm ci
COPY agent-ui/ ./
RUN npm run build

FROM golang:1.26-alpine AS server-builder
WORKDIR /app/agent-server
COPY agent-server/go.mod agent-server/go.sum ./
RUN go mod download
COPY agent-server/ ./
COPY --from=ui-builder /app/agent-ui/dist ./web/dist
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/netx-sre-agent ./cmd/server

FROM ghcr.io/foundry-rs/foundry:latest AS foundry

FROM ubuntu:22.04
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=foundry /usr/local/bin/cast /usr/local/bin/cast
COPY --from=server-builder /bin/netx-sre-agent /app/netx-sre-agent
COPY --from=server-builder /app/agent-server/web/dist /app/web/dist
COPY --from=server-builder /app/agent-server/skills /app/skills
ENV NETX_HTTP_ADDR=:8080
ENV NETX_DATA_DIR=/data/agents
ENV NETX_WEB_DIST=/app/web/dist
ENV NETX_SKILLS_DIR=/app/skills
EXPOSE 8080
VOLUME ["/data/agents"]
ENTRYPOINT ["/app/netx-sre-agent"]
