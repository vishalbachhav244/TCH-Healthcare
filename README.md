# TrueCare

TrueCare is an Angular frontend for healthcare operations. This independent repository was built from the November 26 enterprise frontend brief.

Try the [public TrueCare demo](https://tch-healthcare-demo.pages.dev). Use the sample accounts below and enter only fictional information. Each browser keeps its own demo records.

## Run the evaluation workspace

Use Node.js 24.22.3. Start from this directory.

```powershell
npm ci
npm start
```

Open [TrueCare on loopback](http://127.0.0.1:4280). Use the following evaluation accounts with the shared password `TrueCare-Local-2026`. Enter only fictional data. Account credentials are distributed in this developer guide.

Open [Find care](http://127.0.0.1:4280/find-care) to browse published sample facilities and times. Select an appointment and sign in with `patient` or `family` to book at Meridian Medical Centre. On the appointment day, open the [self-service kiosk](http://127.0.0.1:4280/kiosk/mer-central) and enter the appointment code or scan a QR pass image.

To create a separate patient account, open [Create a patient account](http://127.0.0.1:4280/register) or start from an appointment selected in Find care. Use the invitation for your chosen facility and choose a fictional password.

| Evaluation facility | Single-use invitation |
| --- | --- |
| Meridian Medical Centre | `H4K9-M7Q2-V6N3` |
| Meridian North Hospital | `T8L3-R6P7-K4V2` |
| Sunrise Clinic | `B7Q4-N2H8-P5R3` |

The kiosk and reception arrival form can scan a QR pass using a camera after the visitor or receptionist grants browser permission. Both also accept a QR image or the printed code.

| Account | Workspace |
| --- | --- |
| `platform` | Organization provisioning, facility activation, staff roles, inpatient entitlements and public access settings |
| `success` | Subscription reviews and plan management |
| `operations` | Platform activity and incident handling |
| `integration` | Connector setup and redacted exchange audit |
| `partnercare`, `partnerlab` | Separate recipient accounts for requesting a patient-authorized report |
| `network` | Comparison and department drill-down across assigned Meridian facilities |
| `executive` | Hospital overview, clinician schedule blocks and read-only appointment, queue and bed views for two facilities |
| `medicaldirector` | Clinical documentation indicators, flagged laboratory report reviews and referrals |
| `quality` | Case intake, investigation ownership, resolution and history |
| `reception` | Patient registration, appointments, waitlist, arrival verification and queue |
| `clinician` | Assigned consultations, signed visit history, follow-up requests, laboratory orders and prescriptions |
| `pharmacy` | Signed prescriptions, stock receipts, dispensing, supplier and patient returns, and batch ledger |
| `admissions` | Admission requests, bed allocation and transfer, care-team assignment and discharge |
| `wardphysician`, `wardcover` | Assigned inpatient care plans, rounds, ward orders and discharge sign-off |
| `wardnurse`, `wardrelief` | Assigned nursing tasks, task completion and ward observations |
| `emergency` | Emergency arrivals, clinician-assigned priority and admission requests |
| `icu` | Critical care census, reviews and step-down requests |
| `theatre` | Theatre room schedule, readiness and recovery stages |
| `lab` | Laboratory specimen processing and result entry |
| `labreview` | Laboratory authorisation and publication |
| `imaging` | Imaging worklist, room scheduling and acquisition |
| `radiologist` | Imaging report preparation and release |
| `bloodbank` | Component request review, reservation, issue and unit inventory |
| `cashier` | Consultation and inpatient invoices, bed charges and local settlement |
| `finance` | Patient and payer collections, medication refund review and daily reconciliation |
| `claims` | Synthetic policy coverage, preauthorisation, claim status and local payer settlement |
| `stores` | Stock counts, replenishment requisitions and purchase order receiving |
| `procurement` | Requisition decisions, supplier directory and purchase order tracking |
| `workforce` | Facility staff directory, daily shift roster and attendance |
| `biomedical` | Facility equipment register, maintenance work orders and return to service |
| `support` | Housekeeping, sterile supply and dietary work requests |
| `transport` | Admission-linked transport requests, dispatch, pickup and handoff |
| `crm` | Facility enquiry capture and follow-up assignment |
| `crmagent` | Assigned contact work, contact outcomes and linked appointment booking |
| `marketing` | Enquiry conversion, current opt-in counts and local campaign simulations |
| `analyst` | Facility reporting, specialty activity and aggregate CSV exports |
| `automation` | Documentation simulation policy, daily limits and redacted activity |
| `patient` | Ananya Sharma’s own care and any active permissions Rajesh shares in Family profiles |
| `family` | Rajesh Patel’s own care and Family profiles controls to grant, edit or revoke Ananya’s access |
| `sunrise` | Clinic overview and reception without inpatient access |

Registration accepts evaluation codes such as `REG-1001` that generate a fictional profile. A new appointment yields a QR image and opaque code for same-date reception check-in. Booking, check-in, consultation, laboratory and invoice records persist in this browser across role sign-ins.

To exercise records exchange, use separate tabs on the same browser profile. In the `patient` tab, generate a code for CityCare in **Record sharing**. Use `partnercare` to submit the code, then return to the patient tab to authorize a published report such as `LAB-SHARE-0147`. The `integration` account can pause the connector and review exchange activity.

To exercise clinical governance, refer a flagged report as `medicaldirector`. Open the resulting case as `quality`, take ownership and choose a resolution. The Medical Director’s worklist reflects the new case status.

In **Scheduling**, `reception` can add a patient to a clinician’s waitlist and book an available time. At the same facility, `executive` can block and release clinician time. A separate `patient` tab shows how those changes affect available times in **Book a visit**.

In **Appointments**, `reception` can select an existing patient and use their previous clinician at the current facility. After signing a consultation, `clinician` can open **View note** and request a follow-up with a date window. For the demonstration patient, the `patient` tab can book that request under **Follow-up requests**. Reception can also book the request from the patient’s appointment form.

In **Bed Management**, `admissions` can allocate a bed and assign an inpatient physician and ward nurse from the active facility roster. The `wardphysician` and `wardnurse` accounts have sample assignments at both Meridian facilities. A physician’s ward order appears as a nursing task. Its observation and status appear in both workspaces when the assigned nurse completes it. The assigned physician prepares and signs the discharge summary. After Admissions discharges the patient, the summary appears under **Reports** in the patient’s portal.

Use `emergency` to record a registered patient’s arrival, enter the clinician-assigned priority and request admission. Allocate a Critical care bed as `admissions` to show that patient in `icu`. Request step-down there and transfer the admission to a regular ward in Bed Management. Use `theatre` to book an active admission and record its readiness, in-theatre status, recovery and completion.

In **Revenue Cycle**, `cashier` can review a stay under **Inpatient charges**. Discharge freezes the daily bed ledger. The cashier can issue one invoice for that stay and record a local settlement. The patient can see the balance under **Bills**.

During an active consultation, `clinician` can order an imaging study. Use `imaging` to reserve a modality slot and record acquisition. Use `radiologist` to save and release the report. The ordering clinician and the patient’s **Reports** tab show the released summary.

On an assigned admission, `wardphysician` can request a blood component and track its status. Use `bloodbank` to record a synthetic review, reserve a unit and issue it to the linked admission. The inventory shows which units are available, reserved, issued or expired.

In **Pharmacy**, use **Receive stock** to record a batch and its receipt reference. **Stock lots** shows on-hand and quarantined quantities and allows supplier returns. **Stock activity** shows the ledger. A patient return goes into quarantine and credits the unpaid portion of the original medication invoice where applicable. The cashier and patient can see the credited balance or an amount needing payment review.

In **Insurance & TPA**, `claims` can open an eligible invoice, record patient coverage, request preauthorisation and record approval or denial. Prepare and submit the approved claim, then record the local payer settlement. When the claim is resolved, `cashier` can collect any outstanding patient portion.

In **Finance & Revenue**, `finance` can resolve a medication return review and reconcile the facility’s posting day. The counted net amount must match the ledger before the day can be closed.

In **Inventory & Stores**, `stores` can request a catalogue item. In **Procurement**, `procurement` approves the request and issues a purchase order to an eligible supplier. Back in **Receiving**, `stores` records one or more deliveries against the remaining quantity. Pharmacy shows each receipt in its stock activity. Record a physical count from **Stock levels** to post an adjustment to the same ledger.

In **HR & Workforce**, `workforce` can open the staff directory, schedule a shift and record attendance. In **Biomedical Engineering**, `biomedical` can open a work order for a tagged asset, record a local functional check and return the asset to service. While a linked imaging room is unavailable, `imaging` can see affected orders and still cancel them.

Discharge or transfer an admitted patient to send the vacated bed to **Hospital Support Services**. Use `support` to start housekeeping and mark the bed ready, or to manage ward requests for sterile supplies and meal trolleys. Use `transport` in **Ambulance & Patient Transport** to request a trip from an admitted patient’s current bed, dispatch a synthetic unit, record pickup and confirm handoff.

In **Healthcare CRM**, `crm` captures a registered patient’s enquiry and assigns it to `crmagent`. The agent records the contact outcome and books from an available appointment time. **Marketing & Engagement** shows conversion by source. In **My care**, `patient` can opt in to Email or SMS under **Contact preferences**. Use `marketing` to run a local campaign simulation against the current opt-in count.

Use `analyst` to choose a facility and a 7-, 14- or 30-day period in **Enterprise Analytics & BI**. The daily CSV contains aggregate appointment activity, queue waits and INR collections. Use `automation` to enable the documentation draft policy. Then use `clinician` to open **AI & Automation**, request a synthetic draft from a signed visit and review it before recording a decision.

In **My care → Documents**, use `patient` to download and upload a TrueCare sample PDF or TXT. The library shows the document’s origin and supports preview and download. In a signed consultation, `clinician` can release a visit attendance note to the library. In **Record sharing**, a patient can approve one available document version for a recipient.

## Verify

```powershell
npm run lint
npm run format:check
npm test
npm run build
npm run build:evaluation
npm run build:hosted-evaluation
npx playwright install chromium
npm run e2e
npm run verify:release
```

The default build opens an unavailable screen and excludes mock authentication and REST handlers. Use the separate evaluation build and loopback as described in the [deployment guide](docs/DEPLOYMENT_GUIDE.md). See the [implementation checkpoint](docs/FRONTEND_IMPLEMENTATION_STATUS.md) for current coverage.
