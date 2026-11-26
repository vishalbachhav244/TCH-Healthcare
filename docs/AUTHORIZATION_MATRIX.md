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
| Pharmacist | Views signed facility prescriptions and stock. Dispensing writes a stock movement and a medicine invoice. |
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
| Cashier | Signed-encounter invoices, local settlements, and scoped bed charges and finalized inpatient invoices at inpatient-enabled facilities. |
| Patient | Own visits and follow-up requests, available appointment times, passes, queue state, released diagnostic reports and discharge summaries, and bill balances. |
| Sunrise | Clinic overview, reception, waitlist and clinician schedule blocks. Inpatient access is disabled. |
