# Screen inventory

Local identifiers below apply only to this implementation. The 137 canonical screen entries mentioned by the brief are unavailable under the supplied-source instruction. No canonical coverage is asserted.

| Local screen ID | Dashboard | Route or in-route surface | Scope |
| --- | --- | --- | --- |
| TC-LOCAL-01 | Shared | `/sign-in` | Account authentication and field validation |
| TC-LOCAL-02 | Shared | `/denied`, `/unavailable` | Conditional access and inactive release |
| TC-LOCAL-03 | D06 | `/work/overview` | Filters, metrics, trend, CSV and operational alerts |
| TC-LOCAL-04 | D09 | `/work/patients` | Registry search and registration dialog |
| TC-LOCAL-05 | D10 | `/work/appointments` | Worklist, prior-clinician suggestion, follow-up booking, reschedule, cancellation and QR pass |
| TC-LOCAL-06 | D11 | `/work/queue` | Ticket worklist, QR verification, recall, skip, requeue and transfer |
| TC-LOCAL-07 | D12 | `/work/portal` | Appointment history, own pass, reports and bills |
| TC-LOCAL-08 | D13 | `/work/clinical` | Assigned worklist, test order and consultation note dialog |
| TC-LOCAL-09 | D19 | `/work/beds` | Ward board, admission list, allocation and discharge dialogs |
| TC-LOCAL-10 | D20 | `/work/laboratory` | Specimen and result worklist, accession and review dialog |
| TC-LOCAL-11 | D24 | `/work/billing` | Invoice table, invoice form and settlement confirmation |
| TC-LOCAL-12 | D11 | `/display/:facility` | Public token-only signage for approved facilities |
| TC-LOCAL-13 | D01 | `/work/platform` | Organization directory, activation, staff access, entitlement editor and history |
| TC-LOCAL-14 | D02 | `/work/subscriptions` | Account worklist, review schedule and plan editor |
| TC-LOCAL-15 | D03 | `/work/platform-operations` | Incident register, incident editor and activity |
| TC-LOCAL-16 | D05 | `/work/network` | Date-based facility comparison and department drill-down |
| TC-LOCAL-17 | D22 | `/work/pharmacy` | Signed worklist, stock lot directory and dispense dialog |
| TC-LOCAL-18 | D04 | `/work/integrations` | Connector configuration, versioned lifecycle and redacted audit |
| TC-LOCAL-19 | D04 | `/work/record-requests` | Matching-code request, consent status and authorized report preview |
| TC-LOCAL-20 | D12 | `/work/portal` → Record sharing | One-time matching code, consent review, revocation and access history |
| TC-LOCAL-21 | D07 | `/work/clinical-governance` | Seven-day indicators, flagged report worklist, review and referral |
| TC-LOCAL-22 | D08 | `/work/quality` | Case intake, status filter, ownership, resolution and case history |
| TC-LOCAL-23 | D10 | `/work/scheduling` | Date and clinician filters, appointment waitlist, slot conversion, withdrawals and schedule blocks |
| TC-LOCAL-24 | D13 | `/work/clinical` → Consultation | Assigned patient’s signed history, specialty filter and follow-up request lifecycle |
| TC-LOCAL-25 | D12 | `/work/portal` → Appointments | Own follow-up requests, date-window booking, appointment pass and visit status |
| TC-LOCAL-26 | D14 | `/work/inpatient-physician` | Assigned ward worklist, care plan, rounds, ward order placement and status |
| TC-LOCAL-27 | D15 | `/work/nursing-station` | Assigned ward worklist, nursing tasks, observations and completion evidence |
| TC-LOCAL-28 | D19 | `/work/beds` → Admissions → Assign care team | Facility staff directory and versioned physician and nurse assignment |
| TC-LOCAL-29 | D16 | `/work/emergency` | Arrival, manual clinical assessment priority, admission request and live disposition |
| TC-LOCAL-30 | D17 | `/work/critical-care` | Critical-care census, review history, step-down requests and transfer status |
| TC-LOCAL-31 | D18 | `/work/operation-theatre` | Date-based theatre schedule, room booking, stage transitions, recovery and cancellation |
| TC-LOCAL-32 | D14 and D19 | `/work/inpatient-physician` → Care plan and `/work/beds` → Admissions | Discharge draft, signature confirmation, readiness and released summary |
| TC-LOCAL-33 | D24 | `/work/billing` → Inpatient charges | Account worklist, status filter, daily bed ledger and inpatient invoice issue |
| TC-LOCAL-34 | D12 | `/work/portal` → Reports | Own released discharge summaries and download |
| TC-LOCAL-35 | D21 | `/work/radiology` | Imaging orders, date and modality schedule, acquisition and report release |
| TC-LOCAL-36 | D12 and D13 | `/work/clinical` → Consultation and `/work/portal` → Reports | Imaging order and status in the assigned consultation and the patient’s released report |
| TC-LOCAL-37 | D23 | `/work/blood-bank` | Component request review, unit reservation and issue, and stock inventory |
| TC-LOCAL-38 | D14 | `/work/inpatient-physician` → Care plan | Blood component request, withdrawal and unit issue status |
