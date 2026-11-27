# Authorization matrix

**DEMO ONLY — backend will enforce.** Local evaluation accounts are defined in the adapter and documented in the developer README. Sessions expire after eight hours. Facility membership, workspace access, write access and affected record ownership are checked independently.

| Responsibility | Scope |
| --- | --- |
| SaaS platform administrator | Creates organizations, activates facilities, configures inpatient entitlements and grants or revokes named facility roles. |
| Customer success | Reviews subscriptions and changes compatible plans. |
| Platform operations | Tracks incidents and views activity metadata and counts. |
| Integration administrator | Manages connector configuration and masked audit metadata. Cannot open report content or impersonate recipients. |
| Record recipient | Can redeem its own matching codes and view only the exact report version covered by active consent to its connector. |
| Network executive | Compares active, assigned facilities within the selected tenant and drills into their overviews. |
| Medical director | Reviews eligible published reports at assigned facilities and sees linked case status. |
| Quality coordinator | Creates and claims quality cases within assigned facilities. Resolution requires ownership. Clinical referrals expose a process description and status. |
| Pharmacist | Views signed facility prescriptions and the stock ledger. Receives stock, dispenses, returns on-hand stock to a supplier and quarantines returned patient units. A patient return credits the unpaid charge up to the recorded return value. |
| Executive | Meridian facilities. Overview, alert acknowledgement and clinician schedule blocks. Read-only appointments, waitlist, queue and bed views. Bed responses omit admissions. |
| Reception | Default Meridian facility. Patient search and registration, appointment and waitlist commands, and queue operations. Follow-up booking exposes the clinician, date window and booking state. Appointment, queue and dashboard worklists omit encounter records. |
| Clinician | Assigned encounter access with prior signed history for that patient at the same facility. Starts or signs consultations, manages follow-up, orders laboratory and imaging studies and reads released imaging reports for the assigned encounter. |
| Inpatient physician | Active assigned admissions at inpatient-enabled facilities. Records rounds, manages orders and component requests and drafts or signs the discharge summary. Reads related nursing tasks and observations. |
| Ward nurse | Active assigned admissions at inpatient-enabled facilities. Starts and completes linked tasks and records observations. Reads rounds and orders for the assigned admission. |
| Emergency clinician | Emergency arrivals, clinician-entered priority and disposition for registered patients within the selected facility tenant. May request admission. |
| Critical care clinician | Current critical care beds and admissions at inpatient-enabled facilities. Records reviews and requests step-down. |
| Theatre coordinator | Eligible active admissions and theatre schedules at inpatient-enabled facilities. Books rooms and records or cancels stages within the applicable lifecycle. |
| Admissions | Default Meridian facility. Bed and admission lifecycle including care teams and ICU step-down transfers. Discharge requires resolution of open nursing tasks, theatre cases and blood component requests and a signed summary for an assigned care team. Can view released summaries. |
| Laboratory technician | Collection, processing and result entry. |
| Laboratory reviewer | Authorisation and publication. |
| Imaging technician | Facility-scoped imaging worklist, modality bookings, acquisition and cancellation before acquisition. |
| Radiologist | Facility-scoped report preparation and release. Release requires the current report author. |
| Blood bank officer | Authorized inpatient-enabled facilities. Reviews, reserves, releases and issues component units, with a verified active admission and recorded unit custody. |
| Cashier | Signed-encounter invoices, local settlements, medication credits and payment review amounts, and scoped bed charges at inpatient-enabled facilities. |
| Finance officer | Facility posting-day collections and reconciliation. Resolves medication payment reviews and can record a local refund. |
| Insurance coordinator | Facility consultation and inpatient invoices. Records patient coverage, versioned claim decisions and approved payer settlements. |
| Stores officer | Facility lot balances, stock counts, replenishment requests and goods receipts. Only the requester can withdraw a pending requisition. |
| Procurement officer | Facility requisitions, supplier costs and purchase orders. A separate account approves or rejects a requisition. Purchase orders with receipts cannot be cancelled. |
| Workforce coordinator | Active staff assignments and dated shift records for the selected facility. Scheduling and check-in validate the current assignment. A cross-facility overlap returns a conflict without exposing the other roster. |
| Biomedical engineer | Facility equipment and maintenance work orders. Return to service requires a recorded functional check. Registration limits locations according to the facility’s inpatient entitlement. |
| Hospital support coordinator | Inpatient-enabled facilities. Sees bed labels and ward locations, starts and completes housekeeping, and manages structured sterile supply and dietary requests. |
| Transport dispatcher | Inpatient-enabled facilities. Sees eligible admission identity and pickup location. Requests, dispatches and completes trips using units scoped to that facility. |
| CRM coordinator | Engagement-enabled facilities. Searches registered tenant patients, creates enquiries, assigns contact work to active facility agents and views the facility worklist. Records contact and bookings for enquiries assigned to their account. |
| Contact agent | Engagement-enabled facilities. Sees assigned enquiries, records contact and books eligible appointments for those enquiries. |
| Engagement coordinator | Engagement-enabled facilities. Sees aggregate conversion and current channel opt-in counts. Manages local campaign drafts. |
| Patient | Own visits and follow-up requests, available appointment times, passes, queue state, released reports and discharge summaries, dispensed medications, bill balances and facility contact preferences. |
| Sunrise | Clinic overview, reception, waitlist and clinician schedule blocks. Inpatient access is disabled. |
