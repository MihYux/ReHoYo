# ReHoYo Pet

Player-facing desktop companion. This application is independent from the employee Sender Agent and contains no employee publishing UI.

## Regional policy sync

The pet derives a policy code from the player's selected region and fetches:

```text
https://rehoyo.ccwu.cc/api/v1/pet-policy/:region
```

It checks on startup, after the region changes, and every 15 minutes. The previous ETag is sent with `If-None-Match`; a `304` keeps the current behavior unchanged. A new payload is accepted only after schema and SHA-256 verification, then cached locally in `regional-policy-cache.json` and appended to the character system prompt.

Remote instructions remain below player consent, safety controls, pause state, quiet hours, frequency limits, and explicit refusal.

## Local use

```bash
npm install
npm run dev
```

The chat-model API key is configured in the pet's settings panel and stored through Electron's local secure-storage path. No Worker publishing credential is present in this app.

## Test and build

```bash
npm test
npm run build
npm run dist
```

Installers are written to `release/` and named `ReHoYo-Pet-*`.

Platform-specific commands:

```bash
npm run dist:win
npm run dist:mac:x64
npm run dist:mac:arm64
```

Preview installers are unsigned. Windows SmartScreen or macOS Gatekeeper may require manual confirmation.
