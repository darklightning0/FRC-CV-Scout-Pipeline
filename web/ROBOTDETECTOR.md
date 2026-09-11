# Web frontend

This folder is the **[Maneuver-2026](https://github.com/ShinyShips/Maneuver-2026)** FRC scouting app (copied in so the UI/features match the upstream example).

## Run

```bash
cd web
npm install
npm run dev
```

Open http://127.0.0.1:5173/

Optional API keys (TBA / Nexus) go in `web/.env` — see `.env.example`.

## Notes

- Previous custom Vite scout UI is preserved under `../web-legacy/` for reference.
- Python CV / robot tracking code stays in the repo root (`src/`, `models/`, etc.) and is separate from this app.
