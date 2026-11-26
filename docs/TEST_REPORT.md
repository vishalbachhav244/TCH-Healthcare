# Test report

Verification ran locally on 26 November 2026 with Node 24.22.3 and Chromium. The browser suite used separate contexts and the full fixture profile.

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run format:check` | Passed |
| `npm test` | 24 contract and domain tests passed across 2 files |
| `npm run e2e` | 13 Chromium journeys passed, including returning-patient booking and follow-up across reception, clinician and patient tabs. |
| `npm run build` | Passed. Initial assets approximately 358 kB raw and 94 kB estimated transfer. |
| `npm run build:evaluation` | Passed. Initial assets approximately 361 kB raw and 95 kB estimated transfer. |
| `npm run verify:release` | Passed. The default build blocks signed-in entry points and excludes local authentication and persistence. The evaluation build rejects non-loopback access. |
| `npm audit` | Zero reported advisories in the baseline run. This continuation introduced no dependency changes. |
| Browser-local migration | Verified 13 to 14 on the loopback app using persisted synthetic encounters. An existing signed visit appeared in the new history index and accepted a follow-up request. The previous 11 to 12 consent migration was also verified. |
| OpenAPI | 85 operations, unique IDs and checked internal references. |
| Scheduling at 390 px | Loopback Chromium with a synthetic waitlist request passed reflow and selected WCAG axe checks. |

## Browser journeys

- Suggest a returning patient’s previous clinician in intake. Check in using the patient’s pass, filter signed visits by specialty, sign a consultation and request follow-up. In the patient portal, book within the requested window. Cancel at reception, verify the request reopens, then rebook and reload to verify persistence.
- Add a patient to a clinician’s waitlist. From an executive tab, block the day and verify both reception and the patient portal lose the available times. Release the block, book an open time from the waitlist, and confirm the appointment persists after reload. Reject an overlapping block and patient access to the staff route.
- Match a recipient with a patient-issued code, grant one report version, preview it, pause and resume the connector, then revoke access. Check that access disappears on the recipient’s open screen and the patient’s decision survives reload.
- Refer a flagged laboratory result using the keyboard, claim the redacted case, require a resolution and close it. Verify that status updates in the original worklist, the case history survives reload, and the Medical Director cannot open the quality register. Create and filter a facility case.
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

[Integrations](screenshots/integrations-desktop.png) · [Patient record sharing](screenshots/record-sharing-390.png) · [Clinical governance](screenshots/clinical-governance-desktop.png) · [Quality & Compliance](screenshots/quality-register-desktop.png)

[Desktop scheduling](screenshots/scheduling-1440.png) · [Mobile scheduling](screenshots/scheduling-390.png)

[Consultation continuity](screenshots/consultation-continuity-desktop.png) · [Mobile follow-up](screenshots/follow-up-390.png)
