# Workflow specifications

| Brief workflow | Implemented sequence | Outstanding |
| --- | --- | --- |
| 1 New patient consultation | Registration code → slot → pass → check-in → call → assigned consultation → documentation, orders and invoice → local settlement → follow-up request → linked booking | Specialist referrals and broader clinic record |
| 2 Returning patient | Search patient → suggest the most recent completed clinician at the facility → check slots → book, or add a waitlist request | Recurring schedules and authorized cross-facility continuity |
| 3 QR check-in | Issue opaque QR → decode an image or enter code → verify facility and date → issue one ticket → update token-only display | Camera, kiosk, patient notifications and enhanced identity checks |
| 4 Connected records | View published laboratory results → choose a report for a recipient → grant or revoke access → review access history | Uploads, document classification, and expanded report types |
| 5 Inpatient | Request → allocate bed → assign physician and nurse → record care → resolve open tasks, theatre cases and component requests → sign summary → discharge and release the summary → clean and release the bed | Medication administration, advance discharge coordination and summary amendments |
| 6 Laboratory | Clinician order → collect → process → enter result → separate reviewer authorises and publishes → patient-scoped view | Numeric panels, corrections, report files and richer audit |
| 7 Pharmacy | Receive stock → record batch ledger → dispense signed prescription → issue medication invoice and update patient history → process supplier or patient returns | Purchase order receipts, quarantine disposition, customer instructions and partial fills |
| 8 Billing | Signed encounter, medication dispense or finalized bed ledger → invoice → credits and local settlement → refund review → daily collection close | Deposits, receipts, taxes, tender-level reconciliation and closed-day corrections |
| 9 Insurance | Eligible invoice → patient coverage → preauthorisation → prepare and submit → record payer settlement or denial → collect patient remainder → reconcile | Payer rules, appeals, attachments, batch remittances and external clearing |
| 10 Procurement | Request replenishment → approve → choose supplier → issue order → receive all or part into the lot ledger → verify stock and order balance | Supplier onboarding, multiple order lines, non-pharmacy stock and payables matching |
| 11 SaaS onboarding | Create organization → assign preset plan → add and activate facility → set entitlements and named roles → refresh or revoke access | Staff account creation, department configuration and subscription renewals |
| 12 Integration | Configure connector → redeem patient code → request record → grant one available version → verify provenance and consent → audit access | Real external transport, verified partner identities and wider record coverage |
| 13 Patient application | Book → use pass → follow queue → review released records. Grant family appointment or document access → caregiver opens the profile → revoke access or let it expire | Public discovery, family relationship onboarding and reminders |
| 14 CRM and marketing | Open | Conversion, engagement and campaigns |
| 15 AI documentation | Open | Draft, review and audit |

Reception can add a patient to a clinician’s waitlist for a date and convert the request into a standard booking with an appointment pass. An executive at that facility can block an unoccupied time range or release the block. Changes update available times for the patient portal and staff booking. The evaluation uses 15-minute slots and permits new bookings and blocks up to 90 days ahead.

The clinical governance worklist groups published, flagged laboratory reports by reporting period and review status. A Medical Director can acknowledge a report or refer it to Quality & Compliance. The referral opens a de-identified facility case. A coordinator claims the case, selects a resolution and closes it. Each step updates the persisted case history and the linked clinical worklist.

The inpatient workflow uses the current facility’s active physician and nurse roster. The assigned physician records rounds and places or cancels pending orders. The assigned nurse starts a task and records its observation when completing it. Reassignment moves open tasks to the new nurse while preserving prior events. Pending and in-progress tasks stop discharge until completed or cancelled under the applicable role rules.

Emergency records a registered patient’s arrival and the clinician’s explicit priority. An admission request becomes a Bed Management entry, and an occupied critical care bed brings the admission into the ICU census. The ICU clinician records a review and can request step-down. Admissions completes the transfer and releases the previous bed to cleaning. Theatre can schedule an active admission, reject room and patient conflicts, and track readiness, in-theatre status, recovery and completion. Discharge waits for open theatre cases to close.

The assigned physician saves and signs a structured discharge summary. The draft version read at confirmation must match the active admission and care team. Discharge releases the signed summary, closes the final bed segment, freezes the ledger and moves the bed to cleaning in one transaction. The cashier reviews and invoices completed bed charges separately from bed release.

An assigned clinician orders imaging during an active consultation. A technician books a 30-minute modality slot and records acquisition from the scheduled date. Room or patient collisions prevent scheduling. A radiology reviewer prepares and confirms the release of the report. The ordering clinician and patient see the released summary.

An assigned ward physician requests a component for an active admission. Blood Bank can decline the request or record a synthetic review and reserve one in-date unit. The officer can issue the verified reservation or release it to inventory. A pending or reserved request blocks discharge until resolved.

Pharmacy receives a catalogue item against an in-date batch and unique stock reference. Supplier returns deduct the recorded count from on-hand stock. Patients see dispensed medication and returned quantities. Returned medication goes to quarantine, and its original invoice price determines the return value. Credits reduce the unpaid balance. Any remainder is recorded for payment review.

Finance records a local refund or closes the review without one. Finance reconciles the selected posting day against patient and payer collections less refunds. A successful close preserves the counted amount and ledger snapshot.

Insurance uses an existing consultation or inpatient invoice as its synthetic claim anchor. The policy period covers the invoice date. An active claim temporarily holds patient settlement. Approval can cover part of the balance. Posted payer settlement, denial, rejection or cancellation releases the hold. The cashier can then record the remaining patient balance.

Stores requests a pharmacy catalogue item for its facility. Procurement approves the requisition and records the selected supplier and unit cost on the order. Stores receives an in-date batch against the open quantity. The order receipt and Pharmacy ledger entry share the same reference. Partial receipts keep the remaining quantity open. A stock count can then reconcile the on-hand quantity for that lot while preserving any quarantine balance.

Workforce schedules an active facility assignment in half-hour increments up to 90 days ahead. A staff member can work at more than one facility. The same account cannot hold overlapping shifts. Check-in uses today’s IST roster and a current assignment. Check-out completes a shift already in progress. Scheduled shifts may be cancelled, or marked absent on or after the roster day.

Biomedical opens one work order per piece of equipment and marks it unavailable. Maintenance proceeds through start, a recorded local functional check and release. Cancellation from the Open stage restores availability. For linked synthetic imaging rooms, unavailable equipment blocks scheduling and acquisition. An existing appointment still appears in Radiology and can be cancelled. Reports for acquired studies remain available for review.

An admission discharge or bed transfer queues housekeeping for the newly vacated bed. Starting work keeps the bed in Cleaning. Completing work makes it available for allocation. The Admissions release command closes the same task when used. The support coordinator can also queue a ward’s sterile supply delivery or collection and meal trolley delivery or collection, then start and complete it or cancel while queued.

Transport opens a request from the current occupied bed of an admitted patient. Dispatch reserves a compatible porter team or ambulance. Pickup validates that the patient is still assigned to the original bed. Before pickup, a stale request can be cancelled to recover the unit. During transit, Admissions waits for the dispatcher to record handoff before moving or discharging the patient. Handoff releases the unit and preserves trip history. External facility destinations are generic local fixtures.

A CRM coordinator records a phone, reception or referral enquiry for a registered patient and assigns a dated task to an active agent. The agent logs contact attempts and can book from the facility’s available slots after reaching the patient. The booking and enquiry link commit together. Cancelled appointments return the enquiry to the contact worklist and reduce the conversion total.

The patient can opt in or out by channel under Contact preferences. A Marketing user sees conversion counts by enquiry source and current opt-in totals. The coordinator can draft or cancel a campaign, or record a local simulation with a positive eligible count. The simulation recalculates from current preferences and keeps the aggregate recorded at execution.

An analyst selects a facility and an end date for a 7-, 14- or 30-day reporting window. The report groups non-cancelled appointments by day and specialty. It measures queue wait from arrival to the first call, counts cancellations separately and calculates net collections from posted payments less recorded refunds. Export uses the daily aggregate rows.

An automation supervisor enables synthetic documentation drafts and sets a facility limit per IST day. The assigned clinician chooses a signed, completed visit. A local template generates an administrative draft with source context for review. The clinician can save a different format and approve or reject the current version. The decision applies to the draft record. A paused policy stops new requests and leaves pending reviews available.

A patient downloads a supplied sample and uploads it in Documents. The portal shows its origin and lets the patient preview and download it. An assigned clinician can release an attendance note from a signed visit. The note enters the patient’s Documents list with facility provenance. Withdrawal keeps the history row and ends access to that version for both the patient and any recipient.
