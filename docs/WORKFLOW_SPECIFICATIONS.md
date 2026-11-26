# Workflow specifications

| Brief workflow | Implemented sequence | Outstanding |
| --- | --- | --- |
| 1 New patient consultation | Registration code → slot → pass → check-in → call → assigned consultation → documentation, orders and invoice → local settlement → follow-up request → linked booking | Specialist referrals and broader clinic record |
| 2 Returning patient | Search patient → suggest the most recent completed clinician at the facility → check slots → book, or add a waitlist request | Recurring schedules and authorized cross-facility continuity |
| 3 QR check-in | Issue opaque QR → decode an image or enter code → verify facility and date → issue one ticket → update token-only display | Camera, kiosk, patient notifications and enhanced identity checks |
| 4 Connected records | View published laboratory results → choose a report for a recipient → grant or revoke access → review access history | Uploads, document classification, and expanded report types |
| 5 Inpatient | Request → allocate bed → assign physician and nurse → record care → resolve open tasks, theatre cases and component requests → sign summary → discharge and release the summary → clean and release the bed | Medication administration, advance discharge coordination and summary amendments |
| 6 Laboratory | Clinician order → collect → process → enter result → separate reviewer authorises and publishes → patient-scoped view | Numeric panels, corrections, report files and richer audit |
| 7 Pharmacy | Draft → authorized signature → signed worklist → lot and expiry validation → stock movement and separate invoice | Stock receiving, returns, customer instructions and partial fills |
| 8 Billing | Signed encounter or finalized inpatient bed ledger → line-item invoice → local settlement → balance and collections update | Service-day charges, deposits, receipts, tax rules, refunds and reconciliation |
| 9 Insurance | Open | Payer lifecycle |
| 10 Procurement | Open | Requisition, purchase order, goods receipt and ledger |
| 11 SaaS onboarding | Create organization → assign preset plan → add and activate facility → set entitlements and named roles → refresh or revoke access | Staff account creation, department configuration and subscription renewals |
| 12 Integration | Configure connector → redeem patient code → request report → grant one published version → verify provenance and consent → audit access | Real external transport, verified partner identities and additional record formats |
| 13 Patient application | Clinician selection → booking → pass → queue status → released diagnostic reports and discharge summaries → consent or patient-owned follow-up booking | Public discovery, family access and reminders |
| 14 CRM and marketing | Open | Conversion, engagement and campaigns |
| 15 AI documentation | Open | Draft, review and audit |

Reception can add a patient to a clinician’s waitlist for a date and convert the request into a standard booking with an appointment pass. An executive at that facility can block an unoccupied time range or release the block. Changes update available times for the patient portal and staff booking. The evaluation uses 15-minute slots and permits new bookings and blocks up to 90 days ahead.

The clinical governance worklist groups published, flagged laboratory reports by reporting period and review status. A Medical Director can acknowledge a report or refer it to Quality & Compliance. The referral opens a de-identified facility case. A coordinator claims the case, selects a resolution and closes it. Each step updates the persisted case history and the linked clinical worklist.

The inpatient workflow uses the current facility’s active physician and nurse roster. The assigned physician records rounds and places or cancels pending orders. The assigned nurse starts a task and records its observation when completing it. Reassignment moves open tasks to the new nurse while preserving prior events. Pending and in-progress tasks stop discharge until completed or cancelled under the applicable role rules.

Emergency records a registered patient’s arrival and the clinician’s explicit priority. An admission request becomes a Bed Management entry, and an occupied critical care bed brings the admission into the ICU census. The ICU clinician records a review and can request step-down. Admissions completes the transfer and releases the previous bed to cleaning. Theatre can schedule an active admission, reject room and patient conflicts, and track readiness, in-theatre status, recovery and completion. Discharge waits for open theatre cases to close.

The assigned physician saves and signs a structured discharge summary. The draft version read at confirmation must match the active admission and care team. Discharge releases the signed summary, closes the final bed segment, freezes the ledger and moves the bed to cleaning in one transaction. The cashier reviews and invoices completed bed charges separately from bed release.

An assigned clinician orders imaging during an active consultation. A technician books a 30-minute modality slot and records acquisition from the scheduled date. Room or patient collisions prevent scheduling. A radiology reviewer prepares and confirms the release of the report. The ordering clinician and patient see the released summary.

An assigned ward physician requests a component for an active admission. Blood Bank can decline the request or record a synthetic review and reserve one in-date unit. The officer can issue the verified reservation or release it to inventory. A pending or reserved request blocks discharge until resolved.
