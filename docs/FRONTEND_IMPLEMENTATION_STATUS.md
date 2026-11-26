# Frontend implementation status

The frontend is an independent project built from the latest attachment. 10 of 36 dashboard IDs have routed implementations with partial workflow coverage. The other 26 remain open. No dashboard is accepted against every criterion in the brief.

The 137 canonical screen rows and 171 canonical requirement rows are referenced by count in the attachment. Their IDs and individual definitions were not supplied. The register uses local screen IDs and the brief's section numbers while they are unavailable. [Screen inventory](SCREEN_INVENTORY.md)

| Brief requirement | Dashboard ID | Screen ID and route | Implementation | API coverage | Workflow and evidence | Outstanding |
| --- | --- | --- | --- | --- | --- | --- |
| §§10,16.11 Platform onboarding | D01 | TC-LOCAL-13 `/work/platform` | Partial | Organization/facility provisioning, plan assignment and versioned inpatient controls | Platform administration and live denial verified | Plan authoring and changes, staff assignments and additional module controls |
| §§18–19 Authentication and scopes | Shared | TC-LOCAL-01–02 `/sign-in`, `/denied` | Partial | Session create, restore and end, allowed facility list | Route and API denial, expiry tests | Password reset, account settings, OIDC boundary |
| §§9,15 Executive overview | D06 | TC-LOCAL-03 `/work/overview` | Partial | Overview and alert acknowledgement | Filters, export and refresh tested. Automated desktop/mobile a11y. | Additional dated metrics, approvals, staffing and analytics |
| §§9,16.1 Patient access | D09, D10, D11 | TC-LOCAL-04–06 and 12 `/work/patients`, `/work/appointments`, `/work/queue`, `/display/:facility` | Partial | Registration, search, booking, verification, call and token-only display | Browser outpatient path with QR and replay. API conflicts tested. | Reschedule, follow-up, transfer, recall and camera |
| §§9,16.13 Patient mobile | D12 | TC-LOCAL-07 `/work/portal` | Partial | Subject-specific read, book and pass | Patient view, role isolation and pass ownership | Family access, consent, file viewer and notifications |
| §§9,16.1 Consultation | D13 | TC-LOCAL-08 `/work/clinical` | Partial | Assigned worklist, start, lab order and signing | Browser-linked consultation into invoice | Structured clinical chart, medication and referrals |
| §§9,16.5 Admissions | D19 | TC-LOCAL-09 `/work/beds` | Partial | Board, request, allocate, discharge and release | Browser request through release and unit allocation conflict | Ward care, nursing, finance and discharge summary |
| §§9,16.6 Laboratory | D20 | TC-LOCAL-10 `/work/laboratory` | Partial | Worklist, order and stage transitions | Technician interaction and reviewer restrictions | Panel authoring, numerical results, files and corrections |
| §§9,16.8 Billing | D24 | TC-LOCAL-11 `/work/billing` | Partial | Invoice list, signed encounter selection, issue and settlement | Browser invoice to paid and duplicate-settlement contract test | Deposits, tax rules, receipts, refunds and reconciliation |

Refer to the [test report](TEST_REPORT.md) and [accessibility report](ACCESSIBILITY_REPORT.md) for exact run evidence.

## Continuation checkpoint

1. Continue M2, D01 and brief workflow 11. Add persisted named-account facility membership and facility activation for newly provisioned organizations. Re-read membership with each authenticated session and command so deprovisioning takes effect immediately. Add an administrator form to assign and revoke roles, then prove authorization using a new facility and a separate staff session. Extend subscription controls and implement D02–D08 with dedicated workflows.
2. Continue M3–M4 by completing rescheduling and waitlists, queue recall and transfer, specialty history, follow-up, admissions-linked tasks and inpatient billing. Add roles D14–D18 with their own responsibilities and linked domain workflows.
3. Continue M5–M8 with D21–D23 and D25–D36. The next cross-module clinical task after administration is to implement a separately signed prescription, quantifiable batch availability and an atomic dispensing/charge ledger.
4. Complete M9 using patient-scoped record discovery, released documents, consent grants and revocation, partner configuration, public discovery and kiosk check-in. Keep real integrations outside this frontend phase.
5. Complete the canonical inventory reconciliation after the missing catalogues are provided. Continue with cross-browser, assistive-technology and per-workflow acceptance before enabling any release integration. The default build remains inactive.
