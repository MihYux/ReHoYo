# ReHoYo showcase deployment

- Cloudflare Pages project: `rehoyo-ccwu`
- Production branch: `main`
- Pages hostname: `rehoyo-ccwu.pages.dev`
- Intended custom domain: `rehoyo.ccwu.cc`
- Deployment mode: Wrangler Pages Direct Upload

## Commands

```powershell
npm run site:dev
npm run site:build
npm run site:test:e2e
npm run site:deploy:preview
npm run site:deploy
npx wrangler pages deployment list --project-name rehoyo-ccwu
```

## Custom-domain handoff

Cloudflare Pages custom domains must be associated with the Pages project before DNS is changed. In the Cloudflare dashboard, open **Workers & Pages → rehoyo-ccwu → Custom domains**, add `rehoyo.ccwu.cc`, and wait for the domain to enter its DNS-check state.

The delegated `rehoyo.ccwu.cc` zone currently has no public A, AAAA, or CNAME answer. After association, create the record Cloudflare requests; for the standard Pages flow this is a CNAME/flattened CNAME to `rehoyo-ccwu.pages.dev`. Do not remove the zone's `john.ns.cloudflare.com` and `luciane.ns.cloudflare.com` delegation.

After certificate activation, verify HTTPS, the canonical URL, and the custom-domain redirect behavior before treating the handoff as complete.
