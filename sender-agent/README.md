# ReHoYo Sender Agent

Employee-only desktop application for market research, regional analysis, and publishing approved desktop-pet behavior policies.

## Local use

```bash
npm install
npm run dev
```

Use **连接设置** inside the app to paste:

- the GLM API key, model, and API URL;
- the Cloudflare Worker publishing token.

Credentials are stored in `.data/operator-settings.json` during development and in the packaged app's local data directory. The API never returns their plaintext values. Production research and publishing logic does not read API credentials from environment files.

## Quality and installer

```bash
npm test
npm run typecheck
npm run build
npm run dist
```

Installers are written to `release/` and are named `ReHoYo-Sender-Agent-*`.

Only a reviewed, player-safe region policy is sent to `https://rehoyo.ccwu.cc`. Internal research evidence and employee-only metadata are not published.
