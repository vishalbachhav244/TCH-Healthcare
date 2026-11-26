# Workflow specifications

| Brief workflow | Implemented sequence | Outstanding |
| --- | --- | --- |
| 1 New patient consultation | Registration code → available slot → pass → check-in → call → assigned consultation → signed observation or prescription → consultation invoice → local settlement | Referrals and follow-up |
| 2 Returning patient | Search existing tenant identity → choose a slot or add a clinician/date waitlist request → book a released slot or withdraw | Previous-clinician suggestion and recurring schedules |
| 3 QR check-in | Issue opaque QR → decode an image or enter code → verify facility and date → issue one ticket → update token-only display | Camera, kiosk, patient notifications and enhanced identity checks |
| 4 Connected records | View published laboratory results → choose a report for a recipient → grant or revoke access → review access history | Uploads, document classification, and expanded report types |
| 5 Inpatient | Request → allocate → transfer → discharge → cleaning → available | Nursing, daily charges, orders and discharge documentation |
| 6 Laboratory | Clinician order → collect → process → enter result → separate reviewer authorises and publishes → patient-scoped view | Numeric panels, corrections, report files and richer audit |
| 7 Pharmacy | Draft → authorized signature → signed worklist → lot and expiry validation → stock movement and separate invoice | Stock receiving, returns, customer instructions and partial fills |
| 8 Billing | Signed encounter → line-item invoice → local settlement → balance and collections update | Deposits, receipts, price rules, refunds and reconciliation |
| 9 Insurance | Open | Payer lifecycle |
| 10 Procurement | Open | Requisition, purchase order, goods receipt and ledger |
| 11 SaaS onboarding | Create organization → assign preset plan → add and activate facility → set entitlements and named roles → refresh or revoke access | Staff account creation, department configuration and subscription renewals |
| 12 Integration | Configure connector → redeem patient code → request report → grant one published version → verify provenance and consent → audit access | Real external transport, verified partner identities and additional record formats |
| 13 Patient application | Clinician selection → booking → pass → queue status → published reports, consent requests and bills | Public discovery, family and follow-up |
| 14 CRM and marketing | Open | Conversion, engagement and campaigns |
| 15 AI documentation | Open | Draft, review and audit |

Reception can add a patient to a clinician’s waitlist for a date and convert the request into a standard booking with an appointment pass. An executive at that facility can block an unoccupied time range or release the block. Changes update available times for the patient portal and staff booking. The evaluation uses 15-minute slots and permits new bookings and blocks up to 90 days ahead.

The clinical governance worklist groups published, flagged laboratory reports by reporting period and review status. A Medical Director can acknowledge a report or refer it to Quality & Compliance. The referral opens a de-identified facility case. A coordinator claims the case, selects a resolution and closes it. Each step updates the persisted case history and the linked clinical worklist.
