# Authorization matrix

**DEMO ONLY — backend will enforce.** Local evaluation accounts are defined in the adapter and documented in the developer README. Sessions expire after eight hours. Facility membership, workspace access, write access and affected record ownership are checked independently.

| Responsibility | Scope |
| --- | --- |
| SaaS platform administrator | Creates organizations, activates facilities, configures inpatient entitlements and grants or revokes named facility roles. |
| Customer success | Reviews subscriptions and changes compatible plans. |
| Platform operations | Tracks incidents and views activity metadata and counts. |
| Network executive | Compares active, assigned facilities within the selected tenant and drills into their overviews. |
| Pharmacist | Views signed facility prescriptions and stock. Dispensing writes a stock movement and a medicine invoice. |
| Executive | Meridian facilities. Overview and alert acknowledgement. Read-only appointment, queue and bed views. Bed responses omit admissions. |
| Reception | Default Meridian facility. Patient search and registration, appointments and queue commands. |
| Clinician | Assigned appointments and encounters only. Starts or signs consultations and orders laboratory tests. |
| Admissions | Default Meridian facility. Bed and admission lifecycle. |
| Laboratory technician | Collection, processing and result entry. |
| Laboratory reviewer | Authorisation and publication. |
| Cashier | Signed-encounter invoices and local settlements. |
| Patient | Own bookings, passes, queue state, published lab reports and bill balances. |
| Sunrise | Clinic overview and reception. No inpatient access. |
