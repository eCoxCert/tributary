# Tributary app

Static site (Vite, React, wagmi, viem, Ammora SDK) for GIWA Sepolia.

```
npm ci
npm test
npm run build          # output in dist/
npm run preview        # http://localhost:4173
```

## Local build and the social image

`og:url` and `og:image` need an absolute address. On GitHub Pages the workflow passes it from
`actions/configure-pages`. For a local build set it yourself (with the sub-path, if any):

```
VITE_SITE_URL=https://example.github.io/tributary/ npm run build
```

Without `VITE_SITE_URL` those two tags stay relative (`./og.png`), which social sites ignore.

## Scripts

- `scripts/shots.ts`: screenshots and overflow/console checks (needs `npm run preview`).
- `scripts/shots-fixture.ts`: launch-page states with fixture data (needs `npx vite --port 5174`; fixtures exist only in the dev server).
- `scripts/mutate.py`: mutation check, breaks one critical line at a time and expects the tests to fail.
- `scripts/simulate-create.ts`: wallet-less simulation of the create calls.
- `scripts/og.ts`: renders `public/og.png` and `public/apple-touch-icon.png`.
