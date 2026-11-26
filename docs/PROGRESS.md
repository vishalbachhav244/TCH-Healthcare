# Progress ledger

## Finance and Insurance, 27 November 2026

- Added D25 `/work/finance` for facility posting-day totals, medication return decisions and collection close. Cashier and patient bills reflect the refund resolution. Hospital and network metrics use net collections.
- Added D26 `/work/insurance` for policy coverage, preauthorisation, preparation, submission and approved payer settlement. An open claim holds patient collection. A recorded payer payment leaves the remaining patient portion available for settlement.
- Updated access, typed contracts, finance and insurance adapters, cashier and portal views, schema version 20 and OpenAPI. Verified the V19 to V20 upgrade with preserved payment data and a medication return from the previous schema.
- Coverage is 26 dashboard IDs with partial routes and 10 open. Payer rules, appeals, remittances, full reconciliation and accounting exports remain open. [Implementation status](FRONTEND_IMPLEMENTATION_STATUS.md) · [Test evidence](TEST_REPORT.md) · [Finance](screenshots/finance-390.png) · [Insurance](screenshots/insurance-1440.png)

## Pharmacy receiving and returns, 27 November 2026

- Extended D22 with batch receipts, supplier returns, patient returns, and a stock movement ledger. The lot projection separates on-hand stock from quarantined units. Dispensing reads the same on-hand ledger.
- Connected D12 medication history and D24 invoice balances. A patient return applies the eligible unpaid credit to its original medicine invoice. Paid amounts requiring review remain visible. The original charge and settlement are preserved.
- Updated the pharmacy domain, stock and invoice adapters, typed API, Pharmacy, Revenue Cycle and patient views, and OpenAPI. Verified schema 18 to 19 against a legacy lot, dispense and invoice and recorded a new return from that dispense.
- Coverage remains 24 dashboard IDs with partial routes and 12 open. Quarantine disposition, linked procurement receipts, reconciliation, partial fills and payment review resolution remain open. [Implementation status](FRONTEND_IMPLEMENTATION_STATUS.md) · [Test evidence](TEST_REPORT.md) · [Stock ledger](screenshots/pharmacy-ledger-1440.png) · [Medication history](screenshots/patient-medications-390.png)

## Radiology and Blood Bank, 26 November 2026

- Added D21 `/work/radiology` for imaging orders, room scheduling, acquisition and report release. The assigned outpatient clinician can order a study and read its released summary. The patient portal shows its own released report.
- Added D23 `/work/blood-bank` for admission-linked component requests, inventory, recorded review, reservation and issue. An open request blocks discharge. Expired units cannot be reserved or issued. Releasing a reservation restores the unit’s stock state.
- Updated route and role configuration, the typed API, radiology and blood bank domain and mock adapters, consultation, ward and patient views, and OpenAPI. Verified the V17 to V18 upgrade with a preserved encounter, inpatient ledger and invoice and working diagnostic memberships.
- Coverage is 24 dashboard IDs with partial routes and 12 open. Imaging attachments, configurable equipment, report corrections, blood testing records and stock receiving and returns remain open. [Implementation status](FRONTEND_IMPLEMENTATION_STATUS.md) · [Test evidence](TEST_REPORT.md) · [Modality schedule](screenshots/radiology-schedule-1440.png) · [Imaging report](screenshots/imaging-report-390.png) · [Blood Bank review](screenshots/blood-bank-review-390.png)

## Discharge documentation and inpatient billing, 26 November 2026

- Extended D14 and D19 with a versioned discharge draft, physician sign-off, a release gate and a read-only summary. D12 can view and download its own released summaries. Admissions without an assigned care team retain their administrative discharge path.
- Added V17 bed history and frozen inpatient ledgers. Transfers preserve their ward rate. The cashier can review charges, issue one invoice per discharged stay and record a local settlement. Same-day transfers use the highest occupied ward rate. Legacy transfers record only verified coverage and require acknowledgement before invoicing. Already discharged legacy admissions keep their records without generated charges.
- Changed the discharge and bed-charge domain, ward and inpatient mock adapters, typed API, and the physician, Admissions, Revenue Cycle and patient screens. Added OpenAPI operations, expanded the contract and Chromium journeys, and checked the V16 to V17 migration with an occupied bed, a transfer event, a closed admission and a prior consultation invoice.
- Coverage is 22 dashboard IDs with partial routes and 14 open. Inpatient service orders as charge sources, deposits, tax rules, receipts and discharge amendments remain open. [Implementation status](FRONTEND_IMPLEMENTATION_STATUS.md) · [Test evidence](TEST_REPORT.md) · [Mobile discharge summary](screenshots/discharge-summary-390.png) · [Bed charge ledger](screenshots/inpatient-billing-1440.png)

## Emergency, ICU and Operation Theatre, 26 November 2026

- Added D16 `/work/emergency`, D17 `/work/critical-care` and D18 `/work/operation-theatre`. Emergency records clinician-assigned priorities and requests admission. ICU uses occupied critical-care beds for its census and persists reviews and step-down requests. Theatre supports room booking and readiness through recovery.
- Reused existing admission creation and bed allocation. Bed Management surfaces ICU step-down requests and resolves them when an admission leaves the critical-care ward. Open theatre cases block discharge until completed or cancelled.
- Updated the acute care contracts and adapter, shared workspace and Bed Management surfaces, schema version 16, role scopes and the OpenAPI contract. Verified the version 15 upgrade against an occupied bed and a persisted care team.
- Coverage is 22 dashboard IDs with partial routes and 14 open. Discharge documentation and inpatient charges remain in the current milestone. [Implementation status](FRONTEND_IMPLEMENTATION_STATUS.md) · [Test evidence](TEST_REPORT.md) · [Emergency](screenshots/emergency-390.png) · [ICU](screenshots/critical-care-1440.png) · [Theatre](screenshots/operation-theatre-1440.png)

## Inpatient physician and nursing workspaces, 26 November 2026

- Added D14 `/work/inpatient-physician` and D15 `/work/nursing-station` with assigned admissions, ward filters, care team context, rounds, orders, task transitions and observations.
- Added versioned care-team assignment in Bed Management. Physician orders and nurse tasks are linked. Completing a task records its observation in the same transaction. Discharge checks that linked tasks are closed. Facility inpatient controls govern route, navigation, data and writes in both workspaces.
- Updated the ward-care domain and adapter, Beds and ward-care components, schema version 15, the OpenAPI contract and cross-role verification. Existing user-created admissions retain their ward and admission state during upgrade. Named fixture assignments populate the sample worklists.
- Coverage is 19 dashboards with partial routes and 17 open. Emergency, ICU, theatre, discharge documentation and inpatient billing remain in the M4 checkpoint. [Implementation status](FRONTEND_IMPLEMENTATION_STATUS.md) · [Test evidence](TEST_REPORT.md) · [Physician workspace](screenshots/inpatient-physician-1440.png) · [Mobile nursing station](screenshots/nursing-station-390.png)

## Returning-patient scheduling and follow-up, 26 November 2026

- Added a prior-clinician suggestion derived from the selected patient’s latest verified, completed visit at the current facility. Added recent signed observations and a specialty filter within the assigned clinician’s consultation dialog.
- Restricted appointment, queue and dashboard responses to operational data. Only the assigned clinical worklist includes encounter records.
- Added follow-up requests linked to signed encounters. Reception and patients can book within the requested date window. Booking, rescheduling and cancellation use the existing appointment rules and retain the request and visit relationship. Cancellation reopens the request while the date window remains active.
- Updated `src/app/domain/continuity.ts`, the clinical, appointment and portal surfaces, the scope-checked mock adapter, schema version 14 and `docs/openapi.yaml`.
- This extends D10, D12 and D13. The next clinical workspace checkpoint covers D14 and D15. [Implementation status](FRONTEND_IMPLEMENTATION_STATUS.md) · [Test evidence](TEST_REPORT.md) · [Clinical history and follow-up](screenshots/consultation-continuity-desktop.png) · [Mobile follow-up](screenshots/follow-up-390.png)

## Appointment waitlist and clinician schedules, 26 November 2026

- Added Scheduling within D10. Reception can add and withdraw patient requests and convert an available time into an appointment. Authorized facility leads can block and release clinician time. Existing appointments prevent overlapping blocks.
- Added persisted waitlist entries and schedule exceptions in schema version 13. Staff booking, rescheduling, waitlist conversion and the patient portal use the same blocked-slot rules. Cross-tab changes update availability.
- Changed `src/app/features/scheduling.*`, staff booking and patient portal surfaces, `src/app/domain/scheduling.ts`, the scheduling adapters and `docs/openapi.yaml`. The contract and browser suites cover access boundaries, duplicate requests, concurrent conversion and reload persistence.
- Delivery still includes 17 of 36 dashboard IDs with partial coverage. Returning-clinician suggestions, follow-up, recurring schedules and the remaining dashboard work stay open. [Implementation status](FRONTEND_IMPLEMENTATION_STATUS.md) · [Test evidence](TEST_REPORT.md) · [Scheduling screenshot](screenshots/scheduling-1440.png)

## Interoperability and clinical governance, 26 November 2026

- Added connector administration, distinct recipient workspaces and the patient Record sharing tab. Matching codes are recipient-specific and single-use. A grant covers one published laboratory report version for a set duration. Pausing a connector or revoking a grant clears the recipient’s open preview.
- Added Medical Director and Quality & Compliance workspaces. A flagged report can be acknowledged or referred. A referral opens a de-identified, facility-scoped case with a recorded owner, status history and structured resolution.
- Changed the Angular routes and workspace access, `src/app/domain/interoperability.ts`, `src/app/domain/governance.ts`, the corresponding feature and mock adapters, and `docs/openapi.yaml`. Added contract scenarios in `src/app/mocks/rest.spec.ts` and Chromium journeys in `e2e/operations.spec.ts`.
- The implementation ledger records 17 dashboards with partial routes and 19 still open. [Implementation status](FRONTEND_IMPLEMENTATION_STATUS.md)
- [Run results](TEST_REPORT.md) · [Interoperability](screenshots/integrations-desktop.png) · [Patient record sharing](screenshots/record-sharing-390.png) · [Clinical governance](screenshots/clinical-governance-desktop.png) · [Quality register](screenshots/quality-register-desktop.png)

## Continuation, 26 November 2026

- Added distinct subscription, platform operations, healthcare network and pharmacy workspaces.
- Implemented facility activation and versioned per-facility roles with fresh authorization in commands. Added slot availability, appointment changes and queue recall, skip, requeue and transfer.
- Connected clinical prescription signing to pharmacy stock and separate patient invoices.
- See the [implementation status](FRONTEND_IMPLEMENTATION_STATUS.md) for remaining work and the [test report](TEST_REPORT.md) for verification.

## 26 November 2026

- Created the standalone Angular frontend from the latest attached brief. The project has a new `AGENTS.md` and its own Git history.
- Implemented local identity and scope boundaries, Angular HttpClient interception, Dexie persistence and typed workflow events.
- Added organization and facility provisioning, versioned inpatient entitlements, executive overview, patient registry, appointments, queue and signage, clinician worklist, bed management, laboratory, cashier and patient portal.
- Added the responsive design system, local variable font, reduced-motion behavior and an evaluation-only asset service worker.
- Reconciled the 36 dashboard IDs, documented the routes and published the current API contract.
- The [test report](TEST_REPORT.md) contains commands and results. The [implementation status](FRONTEND_IMPLEMENTATION_STATUS.md) identifies the next work and major gaps.
