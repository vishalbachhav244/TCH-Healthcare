# Frontend implementation status

The frontend is an independent project built from the supplied brief. 17 of 36 dashboard IDs have working routes with partial workflow coverage. The other 19 remain open. No dashboard has passed every acceptance criterion in the brief.

The 137 canonical screen rows and 171 canonical requirement rows are referenced by count in the attachment. Their IDs and individual definitions were not supplied. The register uses local screen IDs and the brief's section numbers while they are unavailable. [Screen inventory](SCREEN_INVENTORY.md)

| Brief requirement | Dashboard ID | Screen ID and route | Implementation | API coverage | Workflow and evidence | Outstanding |
| --- | --- | --- | --- | --- | --- | --- |
| §§10,16.11 Platform onboarding | D01 | TC-LOCAL-13 `/work/platform` | Partial | Provisioning, facility activation, scoped named memberships and inpatient controls | Cross-tab authorization and stale-write checks | Staff account creation, department setup and more entitlements |
| §§8,10 Account subscriptions | D02 | TC-LOCAL-14 `/work/subscriptions` | Partial | Review dates and compatible versioned plan changes | Review and downgrade policy checked | Renewals, plan authoring and billing integration |
| §8 Platform operations | D03 | TC-LOCAL-15 `/work/platform-operations` | Partial | Incident open, investigate and resolve and activity metadata | Persisted incident lifecycle and conflict checks | Health probes, alert ownership and escalation |
| §§8,16.4,16.12 Interoperability | D04 | TC-LOCAL-18–19 `/work/integrations`, `/work/record-requests` | Partial | Connector lifecycle, one-time matching, recipient-scoped access and audit | Grant, expiry, provenance, pause and revoke checks | Actual transport, endpoint verification, more record types |
| §§8–9 Network leadership | D05 | TC-LOCAL-16 `/work/network` | Partial | Tenant and facility scoped metrics and drill-down | Branch scope and navigation checked | Trend comparisons, longer reporting periods and exports |
| §§18–19 Authentication and scopes | Shared | TC-LOCAL-01–02 `/sign-in`, `/denied` | Partial | Session create, restore and end, allowed facility list | Route and API denial, expiry tests | Password reset, account settings, OIDC boundary |
| §§9,15 Executive overview | D06 | TC-LOCAL-03 `/work/overview` | Partial | Overview and alert acknowledgement | Filters, export and refresh tested. Automated desktop/mobile a11y. | Additional dated metrics, approvals, staffing and analytics |
| §9 Medical Director | D07 | TC-LOCAL-21 `/work/clinical-governance` | Partial | Seven-day facility indicators, flagged report review and quality referral | Scoped and versioned review, cross-role case status | Broader clinical indicators, policy approvals and peer review |
| §9 Quality & Compliance | D08 | TC-LOCAL-22 `/work/quality` | Partial | Case intake, ownership, structured resolution and versioned history | De-identified referral, ownership and resolution checks | Corrective action tracking, escalations and wider compliance audit |
| §§9,16.1 Patient access | D09, D10, D11 | TC-LOCAL-04–06, 12 and 23 `/work/patients`, `/work/appointments`, `/work/scheduling`, `/work/queue`, `/display/:facility` | Partial | Registration, booking changes, clinician schedule blocks, waitlist intake and conversion, token controls and anonymized display | Pass rotation, replay, blocked-slot enforcement and concurrent waitlist conversion checked | Returning-clinician suggestions, recurring schedules and live camera entry |
| §§9,16.13 Patient mobile | D12 | TC-LOCAL-07 and 20 `/work/portal` | Partial | Own-visit data, live available times, matching codes, grants and access history | Role isolation, pass ownership, scoped report consent and cross-role availability updates | Family access, uploaded document viewer and notifications |
| §§9,16.1 Consultation | D13 | TC-LOCAL-08 `/work/clinical` | Partial | Assigned worklist, laboratory order and independent prescription signature | Browser-linked consultation into invoice and signed pharmacy queue | Structured clinical chart and referrals |
| §§9,16.5 Admissions | D19 | TC-LOCAL-09 `/work/beds` | Partial | Board, request, allocate, discharge and release | Browser request through release and unit allocation conflict | Ward care, nursing, finance and discharge summary |
| §§9,16.6 Laboratory | D20 | TC-LOCAL-10 `/work/laboratory` | Partial | Worklist, order and stage transitions | Technician interaction and reviewer restrictions | Panel authoring, numerical results, files and corrections |
| §§9,16.7 Pharmacy | D22 | TC-LOCAL-17 `/work/pharmacy` | Partial | Signed worklist, eligible stock and atomic dispensing and invoice | Expiry, authorization, duplicate dispensing and billing checked | Receiving, returns, partial fills and stock reconciliation |
| §§9,16.8 Billing | D24 | TC-LOCAL-11 `/work/billing` | Partial | Invoice list, signed encounter selection, issue and settlement | Browser invoice to paid and duplicate-settlement contract test | Deposits, tax rules, receipts, refunds and reconciliation |

Refer to the [test report](TEST_REPORT.md) and [accessibility report](ACCESSIBILITY_REPORT.md) for exact run evidence.

## Continuation checkpoint

1. Continue with returning-clinician suggestions, specialty history and consultation follow-up. Add D14–D18 with distinct responsibilities, admissions-linked tasks and inpatient billing.
2. Continue M5–M8 with radiology D21, blood bank D23, finance and insurance D25–D26, operational domains D27–D32 and engagement and analytics D33–D36. Extend pharmacy receiving and returns around its existing stock ledger.
3. Extend M9 with uploaded and released documents, additional record formats, family access, public discovery and kiosk check-in. Keep real integrations outside this frontend phase.
4. Complete the canonical inventory reconciliation after the missing catalogues are provided. Continue with cross-browser, assistive-technology and per-workflow acceptance before enabling any release integration. The default build remains inactive.
