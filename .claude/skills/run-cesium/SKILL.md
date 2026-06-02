---
name: run-cesium
description: Launch, run, start, build, test, or screenshot the CESIUM dashboard and API server. Use when asked to run the app, verify the server is up, test an endpoint, or check the web dashboard.
---

# Run CESIUM

CESIUM is a web server (Express.js, port 3001) that also serves the dashboard SPA from `Operaciones/`. It requires PostgreSQL via Docker. The agent path is: start Docker, start the API in background, run `smoke.sh` to verify endpoints, and use `chromium-cli` to drive the dashboard UI.

## Prerequisites

- Docker Desktop running
- Node.js 18+
- `curl` available

## Build / Setup

```bash
# From repo root — start PostgreSQL
docker-compose up -d

# Install API deps (only needed once)
cd Operaciones/api && npm install
```

## Run (agent path)

### 1. Start the API server

```bash
cd Operaciones/api
node server.js &
SERVER_PID=$!
# Wait for it to be ready
sleep 2
```

### 2. Verify with smoke tests

```bash
bash .claude/skills/run-cesium/smoke.sh
```

Expected output:
```
=== CESIUM API smoke tests ===
  PASS [200] health
  PASS [200] dashboard html
Results: 2 passed, 0 failed
```

### 3. Drive the dashboard with chromium-cli

```bash
chromium-cli navigate http://localhost:3001/dashboard.html
chromium-cli screenshot /tmp/cesium-dashboard.png
chromium-cli eval "document.title"
```

### 4. Stop the server

```bash
kill $SERVER_PID
docker-compose down
```

## Run (human path)

```bash
docker-compose up -d
cd Operaciones/api && npm run dev
# Browser: http://localhost:3001/dashboard.html
# Ctrl-C to stop
```

## Key endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | API health check |
| POST | `/auth/login` | JWT login |
| GET | `/me` | Current user (requires Bearer token) |
| GET | `/ops/:id/*` | Operation-scoped resources |
| GET | `/dashboard.html` | Web dashboard SPA |

## Gotchas

- **Port 5433 not 5432** — Docker maps PostgreSQL to host port 5433. The API `db.js` must use port 5433 (or whatever `DB_PORT` is set to in `.env`).
- **`.env` required** — Server will crash without `Operaciones/api/.env` containing `JWT_SECRET`, `CESIUM_TOKEN`, and DB credentials. There is no `.env.example` in the repo; ask the user for values.
- **Static files served from `Operaciones/`** — The Express app serves `Operaciones/` as static root, so `dashboard.html` is at `/dashboard.html`, not `/Operaciones/dashboard.html`.
- **ESM only** — `package.json` has `"type": "module"`. All imports must use ESM syntax; `require()` will throw.
- **Socket.IO room names** — Rooms are `op_{operationId}`. Clients must emit `join_operacion` before receiving real-time events.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Error: Cannot find module './config/env.js'` | Missing `.env` file — create it with the required vars |
| `ECONNREFUSED 5432` | DB port mismatch — check `.env` DB_PORT matches docker-compose (5433) |
| `dashboard.html` returns 404 | Server not started, or started from wrong directory |
| Socket events not received | Client didn't emit `join_operacion` with a valid `operacionId` |
