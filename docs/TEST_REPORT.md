# Test report

Verification ran locally on 26 November 2026 with Node 24.22.3 and Chromium. The browser suite used separate contexts and the full fixture profile.

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run format:check` | Passed |
| `npm test` | 15 contract and domain tests passed across 2 files |
| `npm run e2e` | Nine Chromium journeys passed, including the scoped staff access, incident and pharmacy workflows. |
| `npm run build` | Passed. Initial assets approximately 352 kB raw and 93 kB estimated transfer. |
| `npm run build:evaluation` | Passed. Initial assets approximately 355 kB raw and 94 kB estimated transfer. |
| `npm run verify:release` | Passed. The default build blocks signed-in entry points and excludes local authentication and persistence. The evaluation build rejects non-loopback access. |
| `npm audit` | Zero reported advisories in the baseline run. This continuation introduced no dependency changes. |
| OpenAPI | 59 operations, unique IDs and checked internal references. |

## Browser journeys

- Create an organization and a facility, stage a staff role, activate the facility, revoke the scoped role in an open staff tab, then revoke inpatient access.
- Compare hospital facilities, time ranges and metrics. Export the patient-flow CSV and persist an alert acknowledgement. Check responsive layout, keyboard navigation and axe rules.
- Confirm that a clinic omits bed occupancy and rejects direct access to a disabled bed route.
- Review a subscription, reject an incompatible downgrade and drill into authorized network departments.
- Open, investigate, resolve and reload a platform incident.
- Register a patient, reschedule the visit and decode the replacement pass. Check in, reject replay, call the token on a separate display tab, recall, skip, requeue and transfer it. Complete the consultation, order a laboratory test, sign a prescription, then issue and settle a consultation invoice.
- Dispense a signed prescription from an unexpired lot, check the stock reduction and confirm the resulting cashier charge.
- Request admission, allocate a bed, discharge and release the bed after it has entered cleaning.
- Collect a specimen as a technician and open a patient-owned appointment pass and records tabs on mobile. Check mobile axe rules and reflow.

## Known verification limits

Angular reports CommonJS optimisation warnings for the lazy QR encoder and reader dependencies. Cross-browser validation, manual assistive technology review, full API payload validation, accessibility checks on every route, and the outstanding dashboard workflows remain open.

See [accessibility report](ACCESSIBILITY_REPORT.md) and [implementation status](FRONTEND_IMPLEMENTATION_STATUS.md).

[Desktop overview](screenshots/overview-1440.png) · [Mobile overview](screenshots/overview-390.png) · [Patient home](screenshots/patient-390.png) · [Platform administration](screenshots/platform-desktop.png)

[Subscriptions](screenshots/subscriptions-desktop.png) · [Network performance](screenshots/network-desktop.png) · [Platform operations](screenshots/platform-operations-desktop.png) · [Pharmacy](screenshots/pharmacy-desktop.png)
