# ReHoYo Website Worker

Cloudflare Worker serving the public website and the versioned regional-policy API backed by KV.

## Commands

```bash
npm install
npm test
npm run build
npx wrangler dev
npx wrangler secret put PUBLISH_TOKEN
npm run deploy
```

`wrangler.jsonc` binds the `PET_POLICIES` KV namespace and routes the Worker to `rehoyo.ccwu.cc`. Static assets are built from `showcase/` into the ignored `showcase/dist/` directory.

## API

- `GET|HEAD /api/v1/pet-policy/:region` returns the latest safe policy.
- `PUT /api/v1/pet-policy/:region` requires `Authorization: Bearer <PUBLISH_TOKEN>`.
- `GET /api/health` provides a lightweight health response.

Clients should retain the response ETag and use `If-None-Match`; unchanged policies return `304` without a response body.
