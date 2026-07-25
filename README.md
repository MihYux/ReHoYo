# ReHoYo

ReHoYo is now three independent products connected through a small Cloudflare Worker contract:

```text
ReHoYo/
├─ pet/             # player-facing desktop pet and its installer
├─ sender-agent/    # employee-only market research and policy publisher
└─ website-worker/  # public website plus Workers + KV policy API
```

The employee app researches a release, produces a region-specific behavior policy, and publishes the approved policy to Cloudflare KV. Each player's desktop pet checks `https://rehoyo.ccwu.cc/api/v1/pet-policy/:region`. An unchanged ETag returns `304`; a new version is validated, cached locally, and appended to the pet's system prompt.

## Responsibilities

### `sender-agent`

- Market and regional agentic research for authorized employees.
- Human review before any regional pet policy is published.
- GLM API key and Worker publishing token are pasted into **连接设置** inside the app. They are stored locally with restrictive file permissions and are never read from a production `.env` file.
- Publishes only the player-safe regional policy. Research citations, budgets, internal objectives, and credentials are excluded.

### `pet`

- Standalone player desktop pet; it contains no employee console entry point.
- Maps the player's selected region to a remote policy code and polls every 15 minutes.
- Sends `If-None-Match`, keeps the existing prompt on `304`, and activates a changed prompt only after schema and SHA-256 validation.
- Preserves local consent, quiet hours, pause, frequency limits, safety checks, and player refusal over remote release instructions.

### `website-worker`

- Serves the public website and `/api/*` from one Cloudflare Worker.
- Stores the current region policy in the `PET_POLICIES` KV namespace.
- Allows public read-only policy fetches and requires the `PUBLISH_TOKEN` secret for updates.
- Uses the custom domain [rehoyo.ccwu.cc](https://rehoyo.ccwu.cc/).

## Setup

Node.js 24 is recommended.

```bash
npm run setup:all
```

Run each product independently:

```bash
npm run dev:sender
npm run dev:pet
npm run dev:web
```

Open the sender app's **连接设置** page and paste the GLM API key and the Cloudflare publishing token there. The pet's own chat-model key remains configurable in the pet settings.

## Build and test

```bash
npm run test:all
npm run build:all
```

Create the two separate native installers on the current platform:

```bash
npm run dist:sender
npm run dist:pet
```

Artifacts are written independently to `sender-agent/release/` and `pet/release/`. Tagged releases build a Windows x64 NSIS installer and a macOS x64 DMG for both applications.

## Cloudflare deployment

The Worker is managed with Wrangler from `website-worker/`:

```bash
cd website-worker
npx wrangler login
npx wrangler secret put PUBLISH_TOKEN
npm run deploy
```

The KV binding and `rehoyo.ccwu.cc/*` zone route are declared in `website-worker/wrangler.jsonc`. Never add the publishing token to `wrangler.jsonc`, `.dev.vars`, source files, or Git.

API behavior:

- `GET /api/health` — service health.
- `GET /api/v1/pet-policy/CN` — current public policy and ETag.
- `PUT /api/v1/pet-policy/CN` — authenticated employee publish.

## Security boundary

Remote policy changes cannot bypass player settings or local safety checks. The public KV payload contains only the versioned prompt and bounded plan fields required by the pet. API keys, publishing credentials, raw research, source documents, and employee audit data remain local to the sender app.

Installers are currently unsigned preview builds. Windows SmartScreen or macOS Gatekeeper may require manual confirmation until signing and notarization are configured.
