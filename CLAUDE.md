# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CESIUM** is a real-time tactical operations management and tracking platform. It consists of:
- **Web Dashboard** — real-time map-based control center (Cesium.js + vanilla JS)
- **REST API + WebSocket Server** — Express.js backend with Socket.IO
- **Android App** (`Operaciones_Android/`) — Kotlin field tracking client
- **Cesium Proof-of-Concept** (`CESIUM - PEDRO/`) — standalone map demo

## Commands

### Backend API
```bash
# From Operaciones/api/
npm run dev       # Start server on port 3001 (node server.js)
```

### Docker (full stack)
```bash
docker-compose up          # Start PostgreSQL (port 5433) + API (port 3001)
docker-compose up -d       # Detached mode
docker-compose down        # Stop
```

### Android
```bash
# From Operaciones_Android/
./gradlew build            # Build APK
./gradlew installDebug     # Build and install on connected device
```

No linter or test suite is configured in this project.

## Architecture

### Backend (`Operaciones/api/`)

**Entry points:** `server.js` → creates HTTP server → `app.js` (Express) + `sockets/index.js` (Socket.IO).

**Database:** PostgreSQL via `pg.Pool` in `db.js`. Schema defined in `docker-compose.yml` init SQL. Key tables: `usuario`, `tracking_personal`, `tracking_vehiculo`, `grupo_personal`, `grupo_operacion`, `poi`, `area`, `estructura`, `ruta_navegacion`, `dibujo`, `chat_message`. Views: `v_ultima_posicion_personal`, `v_ultima_posicion_vehiculo`, `v_poi_detalle`.

**Route layout:** All operation-scoped endpoints live under `/ops/:id/*`. Other routes: `/auth/login`, `/me`, `/config/cesium-token`, `/catalog/personal`, `/catalog/vehiculos`, `/health`.

**Real-time model:** Clients join a Socket.IO room named `op_{operationId}`. Every mutating API call broadcasts an event to that room (e.g., `poi_creado`, `tracking_personal`, `chat_message`). Chat and route events are filtered server-side by user role before broadcast.

**Auth:** JWT issued on `/auth/login` (bcryptjs password check). Token must be sent as `Authorization: Bearer {token}` on API calls. Socket connections store `socket.userData = { id_personal, rol }` after a `join_operacion` event.

**Roles:** `ADMIN`, `CUT`, `CET`, `CELL` — role controls chat channel visibility and route access.

### Frontend (`Operaciones/js/dashboard/`)

Vanilla ESM modules, no bundler. Each file owns a distinct concern:

| Module | Responsibility |
|---|---|
| `dashboard.js` | Orchestrator — imports and wires all modules |
| `dashboard.map.js` | Cesium.js viewer init, camera, terrain |
| `dashboard.tactical.js` | POI/area/structure CRUD on map (largest file ~86 KB) |
| `dashboard.tracking.js` | Live personnel/vehicle positions + clustering |
| `dashboard.routes.js` | Navigation route rendering per vehicle |
| `dashboard.chat.js` | Real-time chat UI with role filtering |
| `dashboard.drawing.js` | Freehand canvas drawing layer |
| `dashboard.state.js` | Client-side shared state |
| `dashboard.storage.js` | localStorage persistence |
| `dashboard.persistence.js` | Undo/redo stack for tactical elements |
| `dashboard.ui.js` | Sidebar, panels, toolbar buttons |
| `dashboard.events.js` | Global event delegation |

The Cesium viewer is initialized with a Cesium Ion token served from `/config/cesium-token`. Map is bounded to Mexico.

### Android (`Operaciones_Android/`)

Kotlin app that sends GPS positions to the API and receives Socket.IO events. Build via Gradle; target is modern Android.

## Key Configuration

- **`Operaciones/api/.env`** — `JWT_SECRET`, `CESIUM_ION_TOKEN`, DB credentials
- **`docker-compose.yml`** — PostgreSQL service + DB init script, API service
- **Port 3001** — API & WebSocket
- **Port 5433** — PostgreSQL (host-mapped from container 5432)
- Express serves the entire `Operaciones/` folder as static files, so `dashboard.html` is available at the root.
