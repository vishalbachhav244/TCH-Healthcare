# Test report

Verification ran locally on 27 November 2026 with Node 24.22.3 and Chromium. The browser suite used separate contexts and the full fixture profile.

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run format:check` | Passed |
| Spec TypeScript check | `tsc --noEmit -p tsconfig.spec.json` passed. |
| `npm test` | 48 contract and domain tests passed across 3 files |
| `npm run e2e -- --fully-parallel --workers=2` | All 25 Chromium journeys passed, including exact PDF download after reload, signed visit note release and live withdrawal of shared document access. |
| `npm run build` | Passed. Initial assets approximately 382 kB raw and 98 kB estimated transfer. |
| `npm run build:evaluation` | Passed. Initial assets approximately 385 kB raw and 99 kB estimated transfer. |
| `npm run verify:release` | Passed. The default build blocks signed-in entry points and excludes local authentication and persistence. The evaluation build rejects non-loopback access. |
| `npm audit` | Zero reported advisories in the baseline run. This continuation introduced no dependency changes. |
| Browser-local migration | Verified 25 to 26 in Chromium. The new document library opened, a saved laboratory grant could still be retrieved and a saved approved draft survived. |
| Sample PDF | Poppler `pdfinfo` parsed one US Letter page from the generated PDF 1.4 sample. |
| OpenAPI | 176 operations, unique IDs and checked internal references. |
| Scheduling at 390 px | Loopback Chromium with a synthetic waitlist request passed reflow and selected WCAG axe checks. |

## Browser journeys

- Reject a non-catalogue document, upload the downloaded synthetic PDF and verify its exact bytes after portal reload. Grant the document version to a matched recipient, preview it, then withdraw the upload and clear the recipient’s live preview.
- Switch Analytics from a 7- to 14-day window and download the aggregate CSV. Verify its schema and row count, open the specialty report, check the historical empty state and switch to the authorized North facility.
- Enable draft generation as supervisor, generate one draft as the assigned clinician and verify the quota. Reload and inspect source context, save an administrative format edit and pause generation. Approve the pending draft and check the supervisor receives its outcome without the source observation.
- Capture a referral enquiry, assign an agent and keep the work hidden before assignment. Record a missed contact and then a successful one, reload and book a live slot. Verify conversion in Marketing. Draft an Email campaign at zero opt-ins, allow and withdraw permission in the portal, reject the withdrawn audience and run after the patient opts in again. Verify the result after reload and withdraw the facility engagement entitlement.
- Find an active staff member, schedule a shift and reject an overlap. Record check-in, reload, check out and verify the shift is scoped to its facility. Deny this account’s direct navigation to Biomedical Engineering.
- Request stock as Stores. Approve it as Procurement and issue a purchase order to an eligible supplier. Reject over-receiving, then record two partial receipts, reload receipt history and post a physical stock count. Verify the purchase order status and Pharmacy ledger after each handoff.
- Place an imaging order in consultation. Check reserved room times, cancel a second order and filter the modality schedule. Open a Biomedical work order and verify Radiology blocks acquisition live. Reload the equipment register, record the check and release the equipment. Complete acquisition and report review, then verify the released report after patient reload.
- Submit a component request from the assigned ward, verify the discharge gate and exclude an expired unit from selection. Require the review confirmation, reserve and issue a unit after reload, then verify ward status and stock.
- Record an unassessed emergency arrival, assign priority explicitly and request admission. Allocate ICU, record and reload a review, request step-down and transfer to a regular ward. Schedule theatre, reject an overlap and block discharge until the case is complete. Reload the case and a different theatre date, then discharge and verify the emergency disposition closes.
- Admit a patient and assign a physician and nurse. Record a round and complete a linked nursing task. Reject unsigned discharge, transfer to critical care, draft and sign the summary, and confirm that it is withheld until discharge. Download the released summary and issue a bed ledger invoice. Record settlement and verify the paid balance in the patient portal.
- Suggest a returning patient’s previous clinician in intake. Check in using the patient’s pass, filter signed visits by specialty and sign a consultation. Release an attendance note and open it in the patient’s portal. Request follow-up, book within the window, cancel at reception and rebook after the request reopens.
- Add a patient to a clinician’s waitlist. From an executive tab, block the day and verify both reception and the patient portal lose the available times. Release the block, book an open time from the waitlist, and confirm the appointment persists after reload. Reject an overlapping block and patient access to the staff route.
- Match a recipient with a patient-issued code, grant one report version, preview it, pause and resume the connector, then revoke access. Check that access disappears on the recipient’s open screen and the patient’s decision survives reload.
- Refer a flagged laboratory result using the keyboard, claim the redacted case, require a resolution and close it. Verify that status updates in the original worklist, the case history survives reload, and the Medical Director cannot open the quality register. Create and filter a facility case.
- Create an organization and a facility, stage a staff role, activate the facility and revoke the scoped role in an open staff tab. Withdraw the inpatient capability from the open bed, physician, nursing, theatre, cashier, Blood Bank, Hospital Support and Patient Transport views. Verify Biomedical can then register an asset in Outpatient.
- Compare hospital facilities, time ranges and metrics. Export the patient-flow CSV and persist an alert acknowledgement. Check responsive layout, keyboard navigation and axe rules.
- Confirm that a clinic omits bed occupancy and rejects direct access to a disabled bed route.
- Review a subscription, reject an incompatible downgrade and drill into authorized network departments.
- Open, investigate, resolve and reload a platform incident.
- Register a patient, reschedule the visit and decode the replacement pass. Check in, reject replay, call the token on a separate display tab, recall, skip, requeue and transfer it. Finish the consultation and issue an invoice. Record coverage and claim stages, reject authorisation above the requested amount, post the approved share and record the patient remainder.
- Dispense a signed prescription from an unexpired lot, check the stock reduction and confirm the resulting cashier charge.
- Receive a batch, return units to the supplier and dispense from the received stock. Reject excess patient return quantity, credit an unpaid return, and settle the adjusted charge. Process a later return through Finance, verify refund status in the cashier and patient portal, reject a mismatched count and reload the reconciled day.
- Request admission and allocate a bed. Dispatch an available ambulance, record pickup and reload the in-transit trip. Verify discharge is blocked until handoff, complete handoff and verify unit availability. Discharge the admission, then start and complete housekeeping and verify the bed returns to the available list.
- Queue a sterile set request and a dietary request. Cancel the dietary request, begin work on the sterile set request and reload. Filter by service, complete the request, verify both history records and deny direct transport access to the Support coordinator.
- Collect a specimen as a technician and open a patient-owned appointment pass and records tabs on mobile. Check mobile axe rules and reflow.

## Known verification limits

Angular reports CommonJS optimisation warnings for the lazy QR encoder and reader dependencies. Cross-browser validation, manual assistive technology review, full API payload validation, accessibility checks on every route, and the outstanding dashboard workflows remain open.

See [accessibility report](ACCESSIBILITY_REPORT.md) and [implementation status](FRONTEND_IMPLEMENTATION_STATUS.md).

[Desktop overview](screenshots/overview-1440.png) · [Mobile overview](screenshots/overview-390.png) · [Patient home](screenshots/patient-390.png) · [Platform administration](screenshots/platform-desktop.png)

[Subscriptions](screenshots/subscriptions-desktop.png) · [Network performance](screenshots/network-desktop.png) · [Platform operations](screenshots/platform-operations-desktop.png) · [Pharmacy](screenshots/pharmacy-desktop.png)

[Integrations](screenshots/integrations-desktop.png) · [Patient record sharing](screenshots/record-sharing-390.png) · [Clinical governance](screenshots/clinical-governance-desktop.png) · [Quality & Compliance](screenshots/quality-register-desktop.png)

[Desktop scheduling](screenshots/scheduling-1440.png) · [Mobile scheduling](screenshots/scheduling-390.png)

[Consultation continuity](screenshots/consultation-continuity-desktop.png) · [Mobile follow-up](screenshots/follow-up-390.png)

[Inpatient physician](screenshots/inpatient-physician-1440.png) · [Mobile nursing station](screenshots/nursing-station-390.png)

[Mobile emergency](screenshots/emergency-390.png) · [Critical care](screenshots/critical-care-1440.png) · [Operation Theatre](screenshots/operation-theatre-1440.png)

[Mobile discharge summary](screenshots/discharge-summary-390.png) · [Bed charge ledger](screenshots/inpatient-billing-1440.png)

[Modality schedule](screenshots/radiology-schedule-1440.png) · [Mobile imaging report](screenshots/imaging-report-390.png) · [Mobile Blood Bank review](screenshots/blood-bank-review-390.png)

[Pharmacy stock ledger](screenshots/pharmacy-ledger-1440.png) · [Mobile patient medication history](screenshots/patient-medications-390.png)

[Insurance settlement](screenshots/insurance-1440.png) · [Mobile finance reconciliation](screenshots/finance-390.png)

[Purchase order register](screenshots/procurement-1440.png) · [Mobile receiving history](screenshots/receiving-390.png)

[Mobile shift roster](screenshots/workforce-390.png) · [Biomedical work orders](screenshots/biomedical-1440.png)

[Mobile hospital support](screenshots/hospital-support-390.png) · [Transport dispatch](screenshots/transport-1440.png)

[CRM enquiries](screenshots/crm-1440.png) · [Mobile campaign register](screenshots/marketing-390.png)

[Analytics report](screenshots/analytics-1440.png) · [Mobile automation activity](screenshots/automation-390.png)

[Mobile patient document](screenshots/patient-document-390.png) · [Desktop shared document](screenshots/shared-document-1440.png)
