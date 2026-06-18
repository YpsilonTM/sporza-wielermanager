# sporza-wielermanager

Automatisering voor [Sporza Wielermanager](https://wielermanager.sporza.be/) — eerst een API-client die met de site praat, daarna AI-gestuurd teambeheer.

Gebaseerd op het patroon van `wkpronostiek`: Bun server, Playwright VRT-login, Gemini AI, file-based cache.

## Browser / auth

| Omgeving | Browser | Install |
|----------|---------|---------|
| **Lokaal** | System Chrome (`/usr/bin/google-chrome-stable`) | Geen `playwright install` nodig |
| **Docker** | Playwright bundled Chromium | `bunx playwright install chromium --with-deps` in image build |

`BROWSER_MODE=auto` (default) kiest automatisch: bundled in Docker (`RUNNING_IN_DOCKER=true`), system Chrome lokaal.

Bij een verlopen sessie (401/403) wordt automatisch opnieuw ingelogd als `VRT_EMAIL`/`VRT_PASSWORD` gezet zijn. Handmatige `auth-refresh` blijft optioneel.

```bash
bun run auth-refresh   # VRT login → cookies in .wielermanager_cookies.json
```

Alle API-calls zelf blijven gewone HTTP `fetch`-requests met cookies.

## Docker

### Compose (home server)

```bash
cp .env.example .env   # fill GEMINI_API_KEY, VRT_EMAIL, VRT_PASSWORD
docker compose up -d --build
# dashboard: http://<your-server>:3000
```

Cookies and manager logs persist in the `wielermanager-data` volume (`/app/data` in the container).

### Manual build

```bash
docker build -t sporza-wielermanager .
docker run -d --env-file .env -p 3000:3000 -v swm-data:/app/data sporza-wielermanager
```

Chromium wordt tijdens `docker build` geïnstalleerd — niet op de host.

Health check: `GET /health` (used by Docker HEALTHCHECK).

### Auth troubleshooting

Login logs use structured `[auth]` steps. On failure you get:

- error code (`auth_form_not_found`, `login_rejected`, `cookie_missing`, …)
- last URL/title and a page snippet
- actionable hint (wrong password, CAPTCHA, 2FA, …)

Optional debug screenshots: `AUTH_DEBUG_SCREENSHOTS=true` → `DATA_DIR/auth-debug/`.

## Installatie (lokaal)

```bash
bun install
cp .env.example .env
# Vul cookies in (zie Auth hierboven) of zet USE_BROWSER_AUTH=true + VRT credentials
```

Optioneel, alleen als je geen system Chrome/Chromium hebt:

```bash
bunx playwright install chromium   # can hang at 100% on some systems — use system Chrome instead
```

## CLI

```bash
bun run auth-refresh          # VRT login + cookies cachen
bun run roster                # AI ploeg samenstellen (dry-run)
bun run roster --submit       # Squad indienen (nieuw seizoen)
bun run cyclists              # Publieke rennerslijst
bun run team                  # Jouw ploeg (authenticated)
bun run lineup                # AI lineup voorstel (dry-run)
bun run manage --submit       # Roster + lineup automatisch indienen
bun run probe                 # Endpoint discovery
```

`manage` bouwt automatisch een initiële ploeg als je roster leeg of incompleet is.

### Transfers (voorzichtig)

- **Vóór rit 1:** ploeg gratis wijzigen met `bun run roster --submit` — geen transfers
- **Na rit 1:** enkel via transfer; transfers 1–3 gratis, daarna +1M, +2M, +3M, …
- **`manage --submit`** indient alleen lineup — **nooit** automatisch een transfer
- **`manage --submit --allow-transfers`** voert een AI-transfer écht uit (alleen als transfers open zijn)

Auto-manage in de server doet transfers alleen met `ALLOW_AUTO_TRANSFERS=true` in `.env`.

## Server + dashboard

```bash
bun run start
# http://localhost:3000
```

## Config

Zie [.env.example](.env.example). Minimaal nodig voor API-tests:

- `EDITION_SLUG=tour-m-26`
- `VRT_EMAIL` / `VRT_PASSWORD`

Voor AI-beheer ook `GEMINI_API_KEY`.
