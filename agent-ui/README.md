# NetX AI Agent UI

The agent UI is the React frontend for NetX AI. It provides the browser workspace for AgentSpace administration, chat, tasks, automations, artifacts, context files, and integrations.

## Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS 4
- Radix UI primitives
- Local shadcn-style UI components
- lucide-react icons

## Local Run

Start the backend first:

```bash
cd ../agent-server
go run .
```

Then start the UI:

```bash
cd ../agent-ui
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

The Vite development server proxies `/api/v1/*` requests to `http://127.0.0.1:8080`.

## Build

```bash
npm run build
```

The production output is written to:

```text
agent-ui/dist
```

The Dockerfile builds this output and copies it into the Go server image.

## Workspace Areas

- Admin page for AgentSpace creation and configuration.
- Chat workspace with conversation history.
- Task list and task detail views.
- Automation list and automation detail views.
- Artifact list, preview, and download flows.
- Context file upload and management.
- Enterprise WeChat integration setup.
- Basic auth login when backend auth is enabled.

## Source Layout

```text
agent-ui/
├── src/
│   ├── components/
│   │   ├── admin/
│   │   ├── agent-workspace/
│   │   ├── automations/
│   │   ├── artifacts/
│   │   ├── chat/
│   │   ├── context-files/
│   │   ├── tasks/
│   │   └── ui/
│   ├── data/
│   ├── hooks/
│   ├── lib/
│   ├── styles/
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

## API Client

The UI calls the backend through `src/lib/api.ts`. The backend uses POST-style JSON endpoints under `/api/v1`.

Auth helpers live in `src/lib/auth.ts` and use browser session storage for Basic auth credentials.

## Validation

```bash
npm run build
```

This runs the TypeScript compiler and the Vite production build.

## Design Notes

- Keep operational screens dense and scannable.
- Prefer detail pages for row-specific actions.
- Keep list row actions minimal.
- Use stable table widths for time and automation columns.
- Do not expose secrets such as webhook URLs or API keys in rendered text.
