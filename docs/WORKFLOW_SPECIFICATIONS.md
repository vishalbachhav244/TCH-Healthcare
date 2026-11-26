# Workflow specifications

| Brief workflow | Implemented sequence | Outstanding |
| --- | --- | --- |
| 1 New patient consultation | Registration code → slot → pass → check-in → call → assigned consultation → signed observation → consultation invoice → local settlement | Prescription, referrals, follow-up |
| 2 Returning patient | Search existing tenant identity and book another visit | Previous-clinician suggestion and scheduling rules |
| 3 QR check-in | Issue opaque QR → decode an image or enter code → verify facility and date → issue one ticket → update token-only display | Camera, kiosk, patient notifications and enhanced identity checks |
| 4 Connected records | Patient views own published laboratory results with accession and facility | Uploads, consent, sharing and record access audit |
| 5 Inpatient | Request → allocate → transfer → discharge → cleaning → available | Nursing, daily charges, orders and discharge documentation |
| 6 Laboratory | Clinician order → collect → process → enter result → separate reviewer authorises and publishes → patient-scoped view | Numeric panels, corrections, report files and richer audit |
| 7 Pharmacy | Open | Medication catalogue, signing, dispense and stock movements |
| 8 Billing | Signed encounter → line-item invoice → local settlement → balance and collections update | Deposits, receipts, price rules, refunds and reconciliation |
| 9 Insurance | Open | Payer lifecycle |
| 10 Procurement | Open | Requisition, purchase order, goods receipt and ledger |
| 11 SaaS onboarding | Create organization → assign preset plan → add facility → change versioned inpatient entitlement → refresh permissions | Staff memberships, department configuration and complete subscription management |
| 12 Integration | Open | Connector and consent validation |
| 13 Patient application | Clinician selection → booking → pass → queue status → published reports and bills | Public discovery, family and follow-up |
| 14 CRM and marketing | Open | Conversion, engagement and campaigns |
| 15 AI documentation | Open | Draft, review and audit |
