# Test report

Verification ran locally on 26 November 2026 with Node 24.22.3 and Chromium. The browser suite used separate contexts and the full fixture profile.

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run format:check` | Passed |
| `npm test` | 10 contract and domain tests passed across 2 files |
| `npm run e2e` | Passed six Chromium journeys, including cross-tab queue and entitlement updates. |
| `npm run build` | Passed. Initial assets approximately 350 kB raw and 92 kB estimated transfer. |
| `npm run build:evaluation` | Passed. Initial assets approximately 352 kB raw and 93 kB estimated transfer. |
| `npm run verify:release` | Passed. The default build blocks signed-in entry points and excludes local authentication and persistence. The evaluation build rejects non-loopback access. |
| `npm audit` | Zero reported advisories for the pinned dependency graph during this run. |
| OpenAPI | 38 operations, unique IDs and checked internal references. |

## Browser journeys

- Create an organization and a facility, reload, and revoke inpatient access in a separate staff tab.
- Compare hospital facilities, time ranges and metrics. Export the patient-flow CSV and persist an alert acknowledgement. Check responsive layout, keyboard navigation and axe rules.
- Confirm that a clinic omits bed occupancy and rejects direct access to a disabled bed route.
- Register and identify a patient, book and decode a QR appointment pass, reject replay, call a token on a separate display tab, start and sign a consultation, create a laboratory order, issue an invoice and persist paid status.
- Request admission, allocate a bed, discharge and release the bed after it has entered cleaning.
- Collect a specimen as a technician and open a patient-owned appointment pass and records tabs on mobile. Check mobile axe rules and reflow.

## Known verification limits

Angular reports CommonJS optimisation warnings for the lazy QR encoder and reader dependencies. Cross-browser validation, manual assistive technology review, full API payload validation, accessibility checks on every route, and the outstanding dashboard workflows remain open.

See [accessibility report](ACCESSIBILITY_REPORT.md) and [implementation status](FRONTEND_IMPLEMENTATION_STATUS.md).

[Desktop overview](screenshots/overview-1440.png) · [Mobile overview](screenshots/overview-390.png) · [Patient home](screenshots/patient-390.png) · [Platform administration](screenshots/platform-desktop.png)
