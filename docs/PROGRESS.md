# Progress ledger

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
