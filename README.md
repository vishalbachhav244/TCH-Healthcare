# TrueCare

TrueCare is an Angular frontend for healthcare operations. This independent repository was built from the November 26 enterprise frontend brief.

## Run the evaluation workspace

Use Node.js 24.22.3. Start from this directory.

```powershell
npm ci
npm start
```

Open [TrueCare on loopback](http://127.0.0.1:4200). Use the following evaluation accounts with the shared password `TrueCare-Local-2026`. Enter only fictional data. Account credentials are distributed in this developer guide.

| Account | Workspace |
| --- | --- |
| `platform` | Organization provisioning, facility setup and versioned inpatient entitlements |
| `executive` | Hospital overview, appointments, queue and beds, with two facilities |
| `reception` | Patient registration, scheduling, arrival verification and queue |
| `clinician` | Assigned consultations, laboratory orders and signed observations |
| `admissions` | Admission requests, bed allocation, transfer and release |
| `lab` | Laboratory specimen processing and result entry |
| `labreview` | Laboratory authorisation and publication |
| `cashier` | Consultation invoices and local settlement |
| `patient` | Own appointments, QR passes, published laboratory reports and billing balances |
| `sunrise` | Clinic overview and reception without inpatient access |

Registration accepts evaluation codes such as `REG-1001` that generate a fictional profile. A new appointment yields a QR image and opaque code for same-date reception check-in. Booking, check-in, consultation, laboratory and invoice records persist in this browser across role sign-ins.

## Verify

```powershell
npm run lint
npm run format:check
npm test
npm run build
npm run build:evaluation
npx playwright install chromium
npm run e2e
npm run verify:release
```

The default build opens an unavailable screen and excludes mock authentication and REST handlers. Use the separate evaluation build and loopback as described in the [deployment guide](docs/DEPLOYMENT_GUIDE.md). See the [implementation checkpoint](docs/FRONTEND_IMPLEMENTATION_STATUS.md) for current coverage.
