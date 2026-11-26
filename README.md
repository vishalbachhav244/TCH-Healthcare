# TrueCare

TrueCare is an Angular frontend for healthcare operations. This independent repository was built from the November 26 enterprise frontend brief.

## Run the evaluation workspace

Use Node.js 24.22.3. Start from this directory.

```powershell
npm ci
npm start
```

Open [TrueCare on loopback](http://127.0.0.1:4280). Use the following evaluation accounts with the shared password `TrueCare-Local-2026`. Enter only fictional data. Account credentials are distributed in this developer guide.

| Account | Workspace |
| --- | --- |
| `platform` | Organization provisioning, facility activation, staff roles and inpatient entitlements |
| `success` | Subscription reviews and plan management |
| `operations` | Platform activity and incident handling |
| `integration` | Connector setup and redacted exchange audit |
| `partnercare`, `partnerlab` | Separate recipient accounts for requesting a patient-authorized report |
| `network` | Comparison and department drill-down across assigned Meridian facilities |
| `executive` | Hospital overview, clinician schedule blocks and read-only appointment, queue and bed views for two facilities |
| `medicaldirector` | Clinical documentation indicators, flagged laboratory report reviews and referrals |
| `quality` | Case intake, investigation ownership, resolution and history |
| `reception` | Patient registration, appointments, waitlist, arrival verification and queue |
| `clinician` | Assigned consultations, laboratory orders, and prescription drafting and signing |
| `pharmacy` | Signed prescriptions, stock lots, dispensing and medication charges |
| `admissions` | Admission requests, bed allocation, transfer and release |
| `lab` | Laboratory specimen processing and result entry |
| `labreview` | Laboratory authorisation and publication |
| `cashier` | Consultation invoices and local settlement |
| `patient` | Own appointments, QR passes, published laboratory reports and billing balances |
| `sunrise` | Clinic overview and reception without inpatient access |

Registration accepts evaluation codes such as `REG-1001` that generate a fictional profile. A new appointment yields a QR image and opaque code for same-date reception check-in. Booking, check-in, consultation, laboratory and invoice records persist in this browser across role sign-ins.

To exercise records exchange, use separate tabs on the same browser profile. In the `patient` tab, generate a code for CityCare in **Record sharing**. Use `partnercare` to submit the code, then return to the patient tab to authorize a published report such as `LAB-SHARE-0147`. The `integration` account can pause the connector and review exchange activity.

To exercise clinical governance, refer a flagged report as `medicaldirector`. Open the resulting case as `quality`, take ownership and choose a resolution. The Medical Director’s worklist reflects the new case status.

In **Scheduling**, `reception` can add a patient to a clinician’s waitlist and book an available time. At the same facility, `executive` can block and release clinician time. A separate `patient` tab shows how those changes affect available times in **Book a visit**.

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
