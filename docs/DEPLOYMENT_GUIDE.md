# Deployment guide

Use Node 24.22.3 and the checked-in dependency lockfile. The CLI binds to `127.0.0.1` by default.

| Command | Output and access |
| --- | --- |
| `npm start` | Development evaluation at http://127.0.0.1:4280 |
| `npm run build:evaluation` | Optimised evaluation bundle at `dist/evaluation/browser`. Serve only on loopback. The Angular PWA worker caches asset files and has no API data groups. |
| `npm run build:hosted-evaluation` | Public synthetic demo at `dist/hosted-evaluation/browser`. The mock evaluation runs only at `https://tch-healthcare-demo.pages.dev`. |
| `npm run build` | Inactive release boundary at `dist/truecare/browser`. Local authentication, mock handlers and seed code are excluded. |

The `tch-healthcare-demo` Cloudflare Pages project builds the `main` branch of `vishalbachhav244/TCH-Healthcare` from the repository root. The build command is `npm run build:hosted-evaluation` and the publish directory is `dist/hosted-evaluation/browser`. Use `NODE_VERSION=24.22.3`, as pinned in `.nvmrc`. Pages serves `index.html` for Angular routes because the bundle has no top-level `404.html`. [Cloudflare Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/).

Use fictional details and files in both evaluation builds. The hosted demo uses public sample accounts, and each browser stores its own records in IndexedDB. **DEMO ONLY — backend will enforce.** Production activation requires the backend, release controls, authoritative access, separate audit, privacy controls, operational verification and a reviewed deployment configuration.

Host production assets with reviewed Content Security Policy and no secrets. Set `script-src` and `connect-src` for the deployed origin and API. Allow `data:` for locally generated QR images. Validate Angular styles and chart rendering with the final CSP and add the necessary nonce or policy. Browser-local API responses carry no external network traffic.
