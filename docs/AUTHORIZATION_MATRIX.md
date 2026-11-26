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
| Clinician | Assigned encounter access with prior signed history for that patient at the same facility. Starts or signs consultations, requests or withdraws follow-up and orders laboratory tests. |
| Admissions | Default Meridian facility. Bed and admission lifecycle. |
| Laboratory technician | Collection, processing and result entry. |
| Laboratory reviewer | Authorisation and publication. |
| Cashier | Signed-encounter invoices and local settlements. |
| Patient | Own visits and follow-up requests, available appointment times, passes, queue state, published lab reports and bill balances. |
| Sunrise | Clinic overview, reception, waitlist and clinician schedule blocks. Inpatient access is disabled. |
