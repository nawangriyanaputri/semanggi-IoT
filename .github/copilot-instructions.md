# Copilot instructions for SPPG Monitor

## Project overview
This repository contains a three-part system for monitoring food-storage conditions:

- `backend/`: Node.js HTTP API for reading sensor data, health checks, trend analysis, and settings
- `frontend/`: static dashboard served from a small Node.js HTTP server on port 5173
- `firmware/esp32_dht11/`: ESP32 + DHT11 firmware that sends readings to the backend over Wi‑Fi

The app is a local monitoring dashboard for temperature and humidity in a storage room. The dashboard expects a live backend on port 3000 and a frontend UI on port 5173.

## Important runtime behavior
- The backend UI is not the same as the API server.
- Frontend URL: `http://localhost:5173`
- Backend API URL: `http://localhost:3000` or `http://<server-ip>:3000`
- The dashboard fetches `/api/*` from the same host and port 3000 via the browser, so it assumes the app is running on the local machine unless you intentionally change the frontend/API host configuration.
- For ESP32, use the server computer's LAN IPv4 address such as `http://192.168.1.10:3000/api/monitoring/readings`; never use `localhost` in firmware.

## Local startup
Run these commands from the repository root:

```powershell
npm run backend
npm run frontend
```

Then open:

```text
http://localhost:5173
```

If you want to use the backend without an ESP32, set `DATA_MODE=simulation` in `backend/.env` and restart the backend.

## Configuration and secrets
- `backend/.env` is local-only configuration and is not committed.
- `firmware/esp32_dht11/src/secrets.h` is local-only and must match `DEVICE_API_KEY` in the backend configuration.
- Keep API keys and Wi‑Fi credentials private; do not commit or expose them.

## File roles
- `backend/src/server.js`: creates the API server; listens on `PORT` and `HOST`
- `backend/src/routes.js`: dispatches API endpoints
- `backend/data/readings.json`: stores recent readings
- `backend/data/settings.json`: stores parameter thresholds
- `frontend/src/api.js`: frontend API client that calls backend endpoints
- `frontend/src/main.js`: app bootstrap and health/dashboard initialization
- `firmware/esp32_dht11/src/main.cpp`: ESP32 firmware that sends DHT11 readings to the backend

## Validation expectations
- Prefer small, targeted validation when changing code.
- Backend tests are available with:

```powershell
cd backend
npm test
```

- For UI and full system verification, start both backend and frontend and confirm the dashboard loads on `http://localhost:5173`.

## Common pitfalls
- Do not open `http://localhost:3000` expecting the dashboard; that is the backend API server, not the frontend GUI.
- Do not use `localhost` in the ESP32 firmware because it resolves to the ESP32 itself, not the host machine.
- If the backend is not reachable, check that the backend is running, that `PORT=3000` is not already taken, and that the server is listening on `0.0.0.0` or the correct local interface.
- If the frontend does not load, check that the frontend server started on `127.0.0.1:5173` and that no firewall or port conflict blocks it.
