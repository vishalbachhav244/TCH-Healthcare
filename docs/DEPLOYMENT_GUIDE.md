# Deployment guide

Use Node 24.22.3 and the checked-in dependency lockfile. The CLI binds to `127.0.0.1` by default.

| Command | Output and access |
| --- | --- |
| `npm start` | Development evaluation at http://127.0.0.1:4200 |
| `npm run build:evaluation` | Optimised evaluation bundle at `dist/evaluation/browser`. Serve only on loopback. The Angular PWA worker caches asset files and has no API data groups. |
| `npm run build` | Inactive release boundary at `dist/truecare/browser`. Local authentication, mock handlers and seed code are excluded. |

Keep the evaluation output in isolated local development. Use no actual patient details or documents. The loopback guard is a local safety boundary, and the default output provides no active clinical service. Production activation requires the backend, release controls, authoritative access, separate audit, privacy controls, operational verification and a reviewed deployment configuration.

Host production assets with reviewed Content Security Policy and no secrets. Set `script-src` and `connect-src` for the deployed origin and API. Allow `data:` for locally generated QR images. Validate Angular styles and chart rendering with the final CSP and add the necessary nonce or policy. Browser-local API responses carry no external network traffic.
