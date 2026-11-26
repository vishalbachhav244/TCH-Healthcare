# TRUECARE
# COMPLETE ENTERPRISE FRONTEND ENGINEERING & PRODUCT UI/UX IMPLEMENTATION

## 1. ROLE AND RESPONSIBILITY

Act as a cross-functional enterprise product engineering team consisting of:

- Chief Technology Officer
- Principal Angular Architect
- Staff Frontend Engineer
- Principal Product Designer
- Senior UI/UX Engineer
- Healthcare Domain Consultant
- Enterprise SaaS Architect
- Product Manager
- Technical Business Analyst
- Accessibility Specialist
- Data Architect
- QA Automation Engineer
- Application Security Engineer

Your responsibility is to implement the complete frontend application of TrueCare using enterprise product engineering standards.

TrueCare is an actual commercial healthcare SaaS product intended for use by hospitals, clinics, doctors, healthcare professionals, patients and healthcare networks.

Build it accordingly.

---

## 2. PRODUCT DEFINITION

**Product Name:** TrueCare

**Product Category:** AI-enabled, end-to-end Healthcare Operating System.

**Business Model:** Modular, configurable, multi-tenant enterprise SaaS.

**Target Customers:**

- Individual doctors
- Clinics
- Polyclinics
- Specialty clinics
- Small hospitals
- Medium-sized hospitals
- Multi-speciality hospitals
- Hospital chains
- Healthcare networks
- Hospitals using existing HMS/HIS/EMR/EHR systems
- Healthcare integration partners

TrueCare connects clinical care, hospital operations, patient management, healthcare interoperability, administrative workflows, financial management, patient engagement, marketing and AI-powered assistance within one unified platform.

The platform must support different healthcare organizations through configurable subscriptions, facilities, departments, modules, permissions, clinical templates and operational policies.

The core product differentiators are:

- End-to-end hospital operations
- Connected longitudinal patient medical records
- Consent-based cross-hospital information exchange
- Integration with existing hospital management systems
- Intelligent appointment scheduling
- QR-based patient arrival and check-in
- Doctor-associated patient queues
- Connected patient journey orchestration
- Governed AI assistance
- Integrated hospital CRM and marketing
- Configurable multi-tenant SaaS delivery

---

## 3. CRITICAL IMPLEMENTATION DIRECTIVE

This is the development of the actual frontend of the commercial TrueCare product.

It is not a prototype, demonstration application, proof of concept, design exploration or temporary UI.

Build the application from the perspective of real hospital staff and patients who will use these interfaces during their daily activities.

The frontend will initially communicate with mock APIs and use realistic synthetic data because the Java Spring Boot backend will be implemented later.

This is a temporary data-source implementation strategy, not a limitation of the product scope.

### Mandatory user-facing presentation rules

Do not display development terminology in normal product screens.

Prohibited user-facing page titles, navigation labels, descriptions and interface elements include:

- Demo Dashboard
- Demo Mode
- Mock Patient
- Mock Data
- Sample Hospital
- Prototype
- Conceptual Dashboard
- Coming Soon
- Work in Progress
- Placeholder Module
- Example Feature
- Feature Under Development
- Test User
- Simulated Dashboard
- Lorem Ipsum
- Showcase
- Preview Application

Use professional, authentic product terminology.

For example:

- Hospital Overview
- Patient Registration
- Clinical Workspace
- Today's Appointments
- Consultation Queue
- Patient Health Record
- Bed Management
- Revenue Cycle
- Laboratory Worklist
- Organization Settings
- Healthcare Integrations

Never add explanatory marketing paragraphs to operational screens merely to fill space.

### Environment and safety boundary

Synthetic fixtures must remain restricted to controlled development, staging and evaluation environments.

Keep environment identification in the deployment/access boundary and developer documentation rather than inserting repetitive development labels into normal product pages.

Prevent the mock-enabled build from being released as an authorized live clinical system.

Do not falsely present external integrations, AI capabilities, payments, notifications or legally valid clinical records as operational when the necessary backend or third-party service is not connected.

Clinical actions performed with synthetic data must not affect real patients.

Do not accept, persist or transmit real patient information in the mock environment.

---

## 4. AUDIT THE EXISTING REPOSITORY

Before implementation:

1. Read the existing `AGENTS.md`.
2. Read all TrueCare product, functional and architecture specifications.
3. Read the existing frontend implementation package.
4. Inspect the current Angular application.
5. Identify existing modules, components, routes and services.
6. Identify completed, partially implemented and missing functionality.
7. Inspect the existing design system.
8. Review mock data and application state implementation.
9. Preserve completed functionality that meets the required engineering standards.
10. Refactor inadequate implementations where necessary.
11. Create a complete product implementation register.
12. Begin implementation immediately.

The minimum scope is:

- 28 core product modules.
- 36 distinct role-based dashboards and workspaces.
- 137 existing functional screen specifications.
- 171 existing functional requirements.
- All associated patient, clinical, administrative and operational workflows.

The screen and requirement counts are baselines, not maximum limits.

Expand them wherever the complete product requires additional screens or functionality.

Do not stop after completing one dashboard or module.

---

## 5. TECHNOLOGY STACK

Use the latest stable Angular version available at implementation time.

The current baseline is Angular 22.x.

Verify the exact compatible versions using official Angular documentation and package metadata.

Use:

- Angular standalone architecture
- TypeScript strict mode
- Compatible Node.js LTS
- Angular Signals
- RxJS
- Angular Router
- Lazy-loaded feature routes
- Angular HttpClient
- Functional HTTP interceptors
- Angular CDK and Angular Aria where appropriate
- Typed forms
- Angular Material selectively
- SCSS
- CSS custom properties
- Semantic design tokens
- Mock Service Worker
- IndexedDB using Dexie.js or an appropriate equivalent
- Apache ECharts
- Compatible scheduling/calendar components
- Lucide iconography
- Angular PWA capabilities
- Vitest
- Playwright
- axe-core
- ESLint
- Prettier
- OpenAPI contracts

Do not install experimental, deprecated or prerelease dependencies without a documented technical justification.

Use stable, maintained and commercially suitable dependencies.

Pin compatible dependency versions and commit the lockfile.

Do not implement Java Spring Boot, a production database or actual external healthcare integrations during this frontend phase.

---

## 6. FRONTEND ENGINEERING ARCHITECTURE

Use domain-driven, modular frontend architecture with clear separation of concerns.

Establish architectural boundaries for:

- Application bootstrap
- Application shells
- Authentication
- Session management
- Tenant and facility context
- Feature entitlements
- Authorization
- Navigation
- Dashboard resolution
- Shared design system
- Domain models
- API contracts
- Application services
- Feature state
- Data-access repositories
- Mock API infrastructure
- Persistent synthetic data
- Real-time event abstraction
- Error handling
- Logging
- Automated testing

Recommended logical structure:

```text
src/app/
├── core/
│   ├── authentication/
│   ├── authorization/
│   ├── tenancy/
│   ├── configuration/
│   ├── entitlements/
│   ├── http/
│   ├── events/
│   └── errors/
├── layouts/
├── design-system/
│   ├── tokens/
│   ├── primitives/
│   ├── components/
│   └── patterns/
├── domain/
├── contracts/
├── application/
├── data-access/
├── features/
│   ├── platform/
│   ├── hospital/
│   ├── patients/
│   ├── appointments/
│   ├── queue/
│   ├── clinical/
│   ├── opd/
│   ├── ipd/
│   ├── nursing/
│   ├── emergency/
│   ├── icu/
│   ├── surgery/
│   ├── laboratory/
│   ├── radiology/
│   ├── pharmacy/
│   ├── blood-bank/
│   ├── billing/
│   ├── finance/
│   ├── insurance/
│   ├── inventory/
│   ├── procurement/
│   ├── workforce/
│   ├── assets/
│   ├── operations/
│   ├── quality/
│   ├── crm/
│   ├── marketing/
│   ├── analytics/
│   ├── interoperability/
│   ├── intelligence/
│   └── patient-portal/
├── mocks/
├── shared/
└── app.routes.ts
```

Adapt this structure to the existing repository rather than blindly creating duplicate folders or applications.

### Engineering principles

Follow SOLID, separation of concerns, dependency inversion, composition, single responsibility and appropriate domain-driven design practices.

Avoid:

- Giant Angular components
- Business logic directly embedded in templates
- Hardcoded data inside components
- Direct IndexedDB access from page components
- Duplicate services and domain models
- Circular dependencies
- Unnecessary global state
- Excessive abstraction
- Uncontrolled subscriptions
- Unmaintainable CSS overrides

Implement reusable domain services and design-system components.

---

## 7. COMPLETE APPLICATION EXPERIENCE

Develop a fully connected application ecosystem including:

### Internal platform experience

Used by TrueCare administrators to manage tenants, subscriptions, organizations, integrations and platform operations.

### Hospital staff experience

Used by hospital management, doctors, nurses, receptionists, pharmacists, laboratory staff, finance teams and other authorized employees.

### Patient experience

Used by patients and authorized caregivers for appointments, medical records, QR check-in, queues, payments and communication.

### Healthcare partner experience

Used by authorized external healthcare organizations to configure integrations and participate in permitted record exchange.

### Public healthcare experience

Public-facing doctor discovery, hospital discovery, appointment booking and relevant patient onboarding journeys.

### Kiosk and display experience

Self-service check-in, QR scanning and public queue displays.

Use appropriate shared infrastructure without forcing every user into the same application layout.

---

## 8. IMPLEMENT ALL 36 DASHBOARDS

Build every dashboard and operational workspace listed below.

Each dashboard must have distinct responsibilities, information hierarchy, actions, data, workflows and permissions.

### A. SaaS Platform Administration

| ID | Dashboard |
|---|---|
| D01 | SaaS Super Admin |
| D02 | Customer Success & Subscriptions |
| D03 | Platform Operations |
| D04 | Interoperability & Integration |

Include organization onboarding, subscriptions, module entitlements, customer usage, tenant management, system monitoring, integration configuration and audit history.

### B. Hospital Leadership & Governance

| ID | Dashboard |
|---|---|
| D05 | Healthcare Network Executive |
| D06 | Hospital Executive |
| D07 | Medical Director |
| D08 | Quality & Compliance |

Include hospital performance, clinical operations, departmental capacity, financial performance, resource utilization, quality indicators, incidents and operational exceptions.

### C. Patient Access & Experience

| ID | Dashboard |
|---|---|
| D09 | Front Desk & Reception |
| D10 | Appointments & Scheduling |
| D11 | Smart Queue Command Center |
| D12 | Patient & Family |

Include registration, patient identification, doctor scheduling, booking, walk-ins, QR check-in, token management, patient records and patient engagement.

### D. Clinical Departments

| ID | Dashboard |
|---|---|
| D13 | Doctor / OPD Workspace |
| D14 | IPD Physician Workspace |
| D15 | Nursing Station |
| D16 | Emergency / Casualty |
| D17 | ICU & Critical Care |
| D18 | Operation Theatre |
| D19 | Admission, Bed & Discharge |

Include consultations, clinical documentation, prescriptions, medical history, admissions, rounds, nursing tasks, observations, emergency workflows, surgery and discharge.

### E. Diagnostics & Medication

| ID | Dashboard |
|---|---|
| D20 | Laboratory / LIMS |
| D21 | Radiology & Imaging |
| D22 | Pharmacy |
| D23 | Blood Bank |

Include clinical orders, sample collection, diagnostic worklists, result authorization, imaging schedules, dispensing, medication stock and authorized blood bank workflows.

### F. Financial Management

| ID | Dashboard |
|---|---|
| D24 | Patient Billing & Cashier |
| D25 | Finance & Revenue |
| D26 | Insurance & TPA |

Include estimates, invoices, charges, deposits, payments, discounts, refunds, claims, payer authorizations, settlements and financial reporting.

### G. Hospital Operations

| ID | Dashboard |
|---|---|
| D27 | Inventory & Stores |
| D28 | Procurement |
| D29 | HR & Workforce |
| D30 | Asset & Biomedical Engineering |
| D31 | Hospital Support Services |
| D32 | Ambulance & Patient Transport |

Include inventory, vendors, purchase orders, goods receipt, staff, rosters, attendance, equipment, maintenance, housekeeping, CSSD, dietary services and transportation.

### H. Marketing & Patient Engagement

| ID | Dashboard |
|---|---|
| D33 | Healthcare CRM & Contact Center |
| D34 | Marketing & Engagement |

Include enquiries, leads, referrals, follow-ups, patient acquisition, communication preferences, campaigns, feedback and conversion analytics.

### I. Enterprise Intelligence

| ID | Dashboard |
|---|---|
| D35 | Enterprise Analytics & BI |
| D36 | AI & Automation Control Center |

Include operational reporting, configurable analytics, AI activities, approval workflows, usage monitoring and automation policies.

### Dashboard implementation rules

Do not create one generic dashboard and change its heading for different roles.

Each dashboard must answer:

- What does this user need to accomplish today?
- What information requires immediate attention?
- What tasks are pending?
- What actions can the user perform?
- Which other departments are connected to their responsibilities?
- What business or clinical information is relevant to this workspace?

Every dashboard must include all necessary secondary screens, detail pages, actions, drawers, forms, dialogs, worklists and reports.

---

## 9. DETAILED DASHBOARD BEHAVIOR

### Hospital Executive Dashboard

Include:

- Current hospital activity
- OPD and IPD performance
- Patient flow
- Appointment performance
- Waiting times
- Bed occupancy
- Department performance
- Revenue and collections
- Operational alerts
- Staff and resource availability
- Pending management approvals
- Drill-down analytics
- Facility and date filters

Do not display IPD or bed metrics for organizations without inpatient capabilities.

### Doctor Workspace

Design a clinical workspace optimized for consultations.

Include:

- Today's schedule
- Consultation queue
- Current patient
- Patient identity and relevant alerts
- Clinical history
- Allergies
- Conditions
- Vitals
- Previous medical reports
- Consultation note editor
- Clinical orders
- Prescriptions
- Referral management
- Follow-up scheduling
- Signed documentation
- Encounter completion

Provide a persistent patient context throughout the consultation.

Use a configurable workspace for medical specialties rather than creating unnecessary duplicate applications.

### Front Desk

Optimize this workspace for speed and efficient keyboard operation.

Include:

- Fast patient search
- Patient registration
- Existing patient identification
- Duplicate identity review
- New appointment
- Walk-in registration
- QR scanning
- Arrival verification
- Queue enrollment
- Doctor assignment
- Billing shortcuts
- Patient appointment history
- Quick operational actions

### Smart Queue Command Center

Include:

- Department and doctor queues
- Current token
- Upcoming tokens
- Waiting patients
- Waiting duration
- Estimated waiting times
- Call next
- Recall
- Skip
- Transfer
- Delay management
- Arrival status
- Completed consultations
- Missed appointments
- Public queue display
- Queue performance reports

Priority handling must follow clinician-approved policies. Do not implement autonomous emergency triage.

### Patient Health Record

Include:

- Patient profile
- Longitudinal medical timeline
- Consultation history
- Medical conditions
- Allergies
- Prescriptions
- Laboratory reports
- Radiology reports
- Uploaded documents
- Previous admissions
- Surgical history
- Record provenance
- Patient-authorized sharing
- Consent management
- Access history

Create functional document viewers and realistic synthetic document attachments.

### Inpatient Workspace

Include interactive bed boards, ward filtering, bed allocation, admissions, transfers, nursing tasks, clinical orders, patient observations, discharge coordination and financial linkage.

### Laboratory Workspace

Include test catalogues, orders, specimen collection, sample tracking, result entry, review, authorization and report publication.

### Pharmacy Workspace

Include authorized prescription queues, medication catalogue, dispensing, stock availability, batch selection, expiry validation, stock movements and billing linkage.

### Billing Workspace

Include invoice creation, service selection, pricing, quantities, applicable taxes, discounts, deposits, payment recording, receipts, adjustments and outstanding balances.

Calculate all totals from transaction data.

### SaaS Administration

Include organization creation, facility creation, subscription selection, module entitlements, facility configuration, permissions, organization status and usage analytics.

### Patient Mobile Application

Include a responsive, mobile-first experience for:

- Patient authentication
- Hospital discovery
- Doctor discovery
- Appointment booking
- Appointment history
- Digital appointment passes
- QR check-in
- Live queue status
- Medical records
- Report viewing
- Document upload
- Record sharing
- Consent requests
- Payments
- Family profiles
- Notifications
- Follow-up bookings

Apply the same quality standards to the remaining dashboards in the dashboard catalogue.

---

## 10. MULTI-TENANCY AND CONFIGURABLE MODULES

TrueCare must operate as a configurable product for different healthcare organizations.

Do not create separate source-code implementations for clinics and hospitals.

Use:

- Tenant
- Organization
- Facility
- Department
- Specialty
- User
- Role
- Permission
- Subscription
- Entitlement
- Module
- Feature
- Workflow policy

### Example organization configurations

**Sunrise Clinic**

- OPD
- Patient registration
- Appointments
- Smart queue
- Clinical records
- Basic billing
- Patient engagement

No IPD, ICU, OT or inpatient nursing features.

**Horizon Polyclinic**

- Multi-specialty OPD
- Multiple doctors
- Scheduling
- Diagnostics
- Pharmacy
- Billing
- CRM

**CityCare Hospital**

- OPD
- IPD
- Wards and beds
- Nursing
- Laboratory
- Pharmacy
- Finance
- Inventory
- Hospital operations

**Meridian Healthcare Network**

- Multiple facilities
- Full hospital management
- Emergency
- ICU
- OT
- Radiology
- Insurance
- Advanced analytics
- AI workflows
- Network administration

**Connected Healthcare Partner**

- Integration configuration
- Patient identity mapping
- Consent-based record exchange
- Synchronization monitoring

### Dynamic feature resolution

Determine feature availability from:

Subscription entitlement AND enabled module AND facility capability AND authorized role AND applicable policy.

Implement a centralized workspace and navigation registry.

The registry must define:

- Dashboard ID
- Route
- Required module
- Required permission
- Applicable facility capability
- Navigation group
- Allowed actions
- Dashboard widgets
- Related screens
- API dependencies

When a facility disables IPD, related menus, widgets, actions and routes must become unavailable.

A user with multiple authorized responsibilities may access multiple workspaces.

Do not use one fixed role-to-dashboard mapping.

Frontend authorization must be treated as a user-experience control. The future backend must independently enforce all access policies.

---

## 11. PREMIUM TRUECARE DESIGN SYSTEM

Create a distinctive enterprise healthcare experience.

The product must not look like an outdated hospital ERP, a generic admin template or an automatically generated collection of KPI cards.

### Visual direction

- Premium contemporary healthcare software
- Refined light and neutral surfaces
- Deep charcoal typography
- Restrained mineral teal or blue accents
- Excellent spacing and alignment
- Carefully controlled visual density
- Subtle elevation
- Precise iconography
- Clear operational hierarchy
- Purpose-built clinical workspaces
- Professional data visualization

Use the existing TrueCare visual references as directional guidance, not as a requirement to reproduce their weaknesses.

### Typography

Use Inter, Geist, Manrope or another commercially suitable and highly readable typeface.

Define typography tokens for:

- Display heading
- Page heading
- Section heading
- Body
- Supporting text
- Labels
- Table text
- Numeric values
- Clinical measurements

Use tabular numerals where they improve data readability.

### Proposed starting color tokens

- Primary: `#176B65`
- Primary hover: `#12564F`
- Main text: `#17252B`
- Secondary text: `#5C6B73`
- Application background: `#F7F8F7`
- Surface: `#FFFFFF`
- Border: `#E0E6E5`
- Selected surface: `#E6F1EE`

Define separate semantic tokens for success, warning, error, critical status and information.

Validate every important color combination for accessibility.

### Design-system components

Develop reusable components for:

- Application header
- Context-sensitive sidebar
- Facility selector
- Workspace switcher
- Global search
- Command palette
- Page headers
- Breadcrumbs
- Buttons
- Input fields
- Select controls
- Date and time controls
- Accessible comboboxes
- Dialogs
- Drawers
- Tables
- Virtualized lists
- Filters
- Pagination
- Tabs
- Status indicators
- Clinical alerts
- Charts
- Calendars
- Timelines
- KPI summaries
- Worklists
- File viewers
- Queue cards
- Bed boards
- Notification center
- Loading skeletons
- Empty states
- Error states
- Confirmation states

Do not use default Angular Material styling without applying the TrueCare design system.

### Interaction standards

Use subtle and purposeful motion, contextual actions, predictable navigation, clear feedback, keyboard shortcuts, accessible focus management and efficient form interaction.

Support reduced-motion preferences.

Avoid unnecessary animations in clinical workflows.

### Responsive standards

Support:

- Large desktop workstations
- Standard desktop displays
- Laptops
- Tablets
- Mobile devices
- Kiosk displays
- Public queue screens

Data-heavy clinical interfaces must remain usable on appropriate devices. Do not simply shrink desktop tables until they become unreadable.

Target WCAG 2.2 AA and verify accessibility through automated and manual testing.

---

## 12. IMPLEMENT ACTUAL MOCK REST APIs

The frontend must communicate through HTTP-based API contracts from the beginning.

Do not import fixture JSON directly into dashboard components.

Use Angular HttpClient for application data communication.

Implement Mock Service Worker or an equivalent interception layer to provide API responses before the Spring Boot backend is available.

### Request flow

```text
Angular Component
        ↓
Feature State / Application Service
        ↓
Typed API Client / Repository
        ↓
Angular HttpClient
        ↓
REST API Request
        ↓
Mock API Handler
        ↓
Domain Rules and Synthetic Persistence
        ↓
Structured API Response
```

Later, the mock interception layer will be disabled and the same API client will communicate with the actual Spring Boot backend.

### API contract requirements

Use versioned endpoints under `/api/v1`.

Implement:

- GET
- POST
- PATCH
- PUT where appropriate
- DELETE only where business rules permit
- Pagination
- Search
- Sorting
- Filtering
- Field validation
- Tenant scoping
- Facility scoping
- Permission checks
- State-transition validation
- Consistent error responses
- Idempotency where applicable
- Concurrency-conflict responses

### Required API domains

Implement API contracts and handlers for:

- Authentication and session
- Tenants
- Organizations
- Facilities
- Departments
- Specialties
- Roles and permissions
- Subscriptions
- Entitlements
- Dashboard summaries
- Patients
- Doctors
- Staff
- Appointments
- Schedules
- Queues
- Check-ins
- Encounters
- Clinical observations
- Diagnoses
- Prescriptions
- Medical documents
- Admissions
- Beds and wards
- Nursing
- Emergency
- ICU
- Surgery
- Laboratory
- Radiology
- Pharmacy
- Blood bank
- Invoices
- Payments
- Refunds
- Insurance claims
- Inventory
- Procurement
- Workforce
- Assets
- Support services
- CRM
- Marketing
- Notifications
- Analytics
- Consent
- Record exchange
- Integrations
- AI activities
- Audit history

### Example endpoints

```text
POST   /api/v1/auth/login
GET    /api/v1/auth/me
GET    /api/v1/entitlements
GET    /api/v1/dashboards/{dashboardId}
GET    /api/v1/patients
POST   /api/v1/patients
GET    /api/v1/patients/{id}
GET    /api/v1/patients/{id}/timeline
GET    /api/v1/doctors/{id}/availability
POST   /api/v1/appointments
POST   /api/v1/appointments/{id}/check-in
GET    /api/v1/queues/{id}
POST   /api/v1/queues/{id}/call-next
POST   /api/v1/encounters
POST   /api/v1/clinical-orders
POST   /api/v1/prescriptions
POST   /api/v1/admissions
GET    /api/v1/beds/availability
POST   /api/v1/invoices
POST   /api/v1/invoices/{id}/payments
POST   /api/v1/consents
POST   /api/v1/record-exchange/requests
GET    /api/v1/facilities/{id}/configuration
```

Maintain an OpenAPI specification for implemented endpoints.

Do not create mock APIs whose request and response contracts cannot reasonably be implemented later in Spring Boot.

---

## 13. REALISTIC SYNTHETIC DATA ENGINE

Create a comprehensive, relationally consistent synthetic healthcare dataset.

Use deterministic seed generation with a configurable reference date.

Do not use real patient information, actual medical records or real personal contact details.

### Initial proposed seed volumes

Use the following as starting targets, adjusting according to realistic organization workloads.

| Data entity | Suggested volume |
|---|---:|
| Healthcare organizations | 5 |
| Facilities | 10 |
| Departments | 60 |
| Doctors | 120 |
| Staff members | 450 |
| Patients | 2,500 |
| Appointments | 8,000 |
| Clinical encounters | 6,000 |
| Medical documents | 3,000 |
| Prescriptions | 4,000 |
| Laboratory orders | 5,000 |
| Radiology orders | 1,200 |
| Hospital beds | 350 |
| Admission records | 900 |
| Invoices | 7,000 |
| Payment records | 6,500 |
| Medication catalogue | 500 |
| Inventory items | 800 |
| Vendors | 80 |
| Insurance claims | 500 |
| CRM enquiries | 1,200 |
| Notifications | 2,500 |
| Consent and exchange records | 400 |

Use smaller fixture profiles for automated tests and a larger dataset for realistic product evaluation.

Do not load all records into every screen simultaneously.

### Data realism requirements

Create:

- Fictional Indian patient names
- Realistic age distributions
- Fictional contact information
- Doctor specialties
- Hospital departments
- Configured schedules
- Appointment histories
- Clinical encounter histories
- Medical reports
- Prescriptions
- Financial transactions
- Inventory movements
- Historical and current admissions
- Bed availability
- Pending clinical tasks
- Completed workflows
- Overdue operational tasks
- Historical analytics
- Patient communication records
- Consent requests
- Integration activities

Maintain consistent identifiers and relationships across every module.

A patient's appointment, consultation, laboratory report, prescription, invoice and payment must belong to the same connected patient journey.

Do not independently generate unrelated records for each dashboard.

### Persistent data

Store synthetic data in IndexedDB through the mock data infrastructure.

All permitted user changes must persist across:

- Page navigation
- Application refresh
- Session changes
- Authorized workspace switching
- Facility switching

Provide a developer-controlled reset and deterministic reseeding mechanism outside ordinary patient and hospital screens.

Do not silently reset data every time the application starts.

---

## 14. NO EMPTY OR INCOMPLETE DEFAULT SCREENS

Every applicable dashboard and important screen must have meaningful data in the initial configured environment.

Populate:

- Tables
- Charts
- Worklists
- Schedules
- Appointment calendars
- Medical timelines
- Notifications
- Reports
- Patient profiles
- Billing records
- Bed boards
- Inventory
- Administrative settings
- Integration activity histories

Avoid:

- Blank dashboard cards
- Zero values caused by missing fixtures
- Empty charts caused by incomplete implementation
- Non-functional buttons
- Unimplemented routes
- Placeholder images
- Meaningless tables
- Hardcoded success messages
- Static decorative graphs

However, implement genuine empty states for legitimate business situations.

For example:

A doctor with no remaining appointments should see an appropriate completed-schedule message, not fabricated appointments.

A clinic without IPD should not display invented bed occupancy.

A newly configured department may genuinely have no records.

A failed integration should not display a false successful connection.

The requirement is meaningful initial population and complete functionality, not concealing valid empty or unavailable states.

---

## 15. DATA-DRIVEN DASHBOARDS

Every dashboard KPI must be derived from the underlying domain data.

Examples:

- Today's appointments: calculate from appointment records for the selected date.
- Waiting patients: calculate from active queue tickets.
- Average waiting time: calculate from actual queue timestamps.
- Bed occupancy: calculate from occupied beds and available capacity.
- Revenue: calculate according to defined invoice or payment metrics.
- Outstanding balance: calculate from charges and settlements.
- Pharmacy stock: calculate from stock movements.
- Doctor workload: calculate from assigned appointments and encounters.
- Laboratory turnaround: calculate from order and result timestamps.
- Marketing conversion: calculate from linked enquiries and appointments.

When a user changes a record, all affected metrics and relevant screens must update.

Do not use randomly changing numbers to imitate real-time operational activity.

Use simulated events that represent valid domain state transitions.

---

## 16. COMPLETE CONNECTED BUSINESS WORKFLOWS

Implement and verify all important workflows.

### Workflow 1 — New patient consultation

Register patient → Book appointment → Verify arrival → Generate token → Call patient → Start consultation → Clinical documentation → Orders and prescription → Billing → Payment → Follow-up.

### Workflow 2 — Returning patient

Identify patient → Retrieve permitted history → Suggest previously consulted doctor → Confirm availability → Appointment or walk-in → Check-in → Consultation.

### Workflow 3 — Smart QR check-in

Generate appointment pass → Scan or enter pass → Verify identity and booking → Validate arrival rules → Create queue ticket → Update doctor workspace → Notify patient.

Prevent duplicate check-in and replayed passes.

### Workflow 4 — Connected medical records

Upload document → Classify document → Preserve original → Add timeline entry → Request authorized sharing → Patient approval → Permitted record access → Audit history.

### Workflow 5 — Inpatient admission

Admission request → Select bed → Validate availability → Admit → Nursing task creation → Clinical orders → Daily charges → Discharge planning → Discharge documentation → Billing and bed release.

### Workflow 6 — Laboratory

Doctor creates order → Lab receives order → Collect specimen → Process sample → Enter results → Authorized review → Publish report → Update patient record.

### Workflow 7 — Pharmacy

Authorized prescription → Dispensing queue → Validate stock and expiry → Dispense → Stock movement → Financial charge → Patient medication history.

### Workflow 8 — Billing and settlement

Performed services → Charge capture → Invoice → Deposit adjustment → Payment → Receipt → Financial report update.

### Workflow 9 — Insurance

Patient coverage → Preauthorization → Claim preparation → Status changes → Settlement → Financial reconciliation.

### Workflow 10 — Procurement

Purchase requisition → Approval → Purchase order → Goods receipt → Stock increase → Inventory report update.

### Workflow 11 — SaaS onboarding

Create organization → Create facilities → Assign subscription → Enable modules → Configure departments → Create users → Assign permissions → Resolve available workspaces.

### Workflow 12 — Healthcare integration

Configure connector → Identity matching → Record request → Consent validation → Authorized synthetic record retrieval → Provenance validation → Exchange audit.

Do not represent this local workflow as a live ABDM or external hospital connection.

### Workflow 13 — Patient application

Find doctor → Book appointment → View appointment pass → Check in → Track queue → View released medical records → Manage consent → Follow-up booking.

### Workflow 14 — CRM and marketing

Capture enquiry → Assign follow-up → Contact task → Appointment booking → Conversion reporting → Permission-based engagement.

### Workflow 15 — AI-assisted clinical documentation

Request assistance → Generate synthetic draft → Review source context → Clinician edits draft → Clinician approves or rejects → Record AI activity.

Do not autonomously authorize diagnoses, prescriptions or treatment decisions.

Complete all other workflows defined in the existing requirement catalogue.

---

## 17. REAL-TIME EXPERIENCE

Implement a typed domain-event abstraction that supports connected workspace updates.

Required event types include:

- PatientRegistered
- AppointmentBooked
- AppointmentRescheduled
- PatientCheckedIn
- QueueTicketCalled
- QueueTicketTransferred
- EncounterStarted
- EncounterCompleted
- ClinicalOrderCreated
- LabResultAuthorized
- MedicationDispensed
- PatientAdmitted
- BedAllocated
- PatientDischarged
- InvoiceCreated
- PaymentRecorded
- ConsentGranted
- RecordReceived
- ModuleConfigurationChanged

Use a local event implementation during frontend development.

Where appropriate, support cross-tab updates using BroadcastChannel and persisted state synchronization.

Later, support Spring Boot SSE or WebSocket adapters through the same event contracts.

Do not claim the browser-based implementation provides real multi-device synchronization across a live hospital network.

---

## 18. AUTHENTICATION AND USER ACCESS

Implement complete user-facing authentication and session experiences:

- Login
- Forgot password
- Password reset flow
- Organization selection
- Facility selection
- Workspace selection
- Session expiry
- Account settings
- User profile
- Notification preferences
- Authorized role-based navigation
- Unauthorized access handling

Use local authentication handlers for the synthetic environment.

Keep test-account configuration in controlled development tooling and documentation.

Do not expose a public unrestricted role switcher in the normal product experience.

Create test accounts for all important user responsibilities so the complete application can be evaluated.

Do not treat frontend tokens or local permissions as production security.

Prepare interfaces for future OIDC and Spring Security integration.

---

## 19. APPLICATION SECURITY AND DATA GOVERNANCE

Implement secure frontend engineering practices from the beginning.

Include:

- Safe input handling
- Runtime API response validation
- Output sanitization
- Secure document rendering
- Content Security Policy planning
- Dependency vulnerability checks
- Permission-aware route handling
- Sensitive-data logging restrictions
- Protected resource access patterns
- Consent-aware record presentation
- Audit history interfaces
- Session lifecycle handling
- Tenant-scoped cache keys

Do not log clinical records, medical documents, authentication tokens or sensitive information to the browser console.

Do not implement public links containing patient information.

Do not allow patient records to leak through search suggestions, cached views, QR payloads or unrelated tenant navigation.

Prevent deployment of synthetic authentication and mock handlers in the future live production build.

---

## 20. BACKEND INTEGRATION READINESS

The future backend will use Java Spring Boot and PostgreSQL.

Prepare all frontend interfaces accordingly.

Maintain:

- OpenAPI contracts
- Typed request and response DTOs
- Domain entity definitions
- Repository interfaces
- Standardized error models
- Pagination contracts
- Filtering conventions
- Date and timezone conventions
- Money representation rules
- Authentication integration interfaces
- Authorization requirements
- Tenant and facility scoping rules
- Real-time event contracts

Use appropriate API representations for timestamps, currency, patient identifiers and clinical measurement units.

Centralize request configuration.

Support environment-based API configuration without rewriting feature components.

The future integration process should primarily involve:

1. Implementing Spring Boot API contracts.
2. Configuring the backend API address.
3. Replacing local authentication with real authentication.
4. Disabling mock request handlers.
5. Connecting real-time event adapters.
6. Validating frontend-backend contracts.
7. Performing full integration and clinical workflow tests.

Do not claim switching one environment flag alone will make the product clinically or operationally production-ready.

---

## 21. PERFORMANCE AND ACCESSIBILITY

Implement:

- Lazy-loaded feature routes
- Efficient Angular change detection
- Optimized component rendering
- Virtual scrolling for large worklists
- Server-style pagination
- Debounced search
- Efficient chart rendering
- Stable caching strategies
- Request cancellation
- Responsive image loading
- Appropriate code splitting
- Accessible form labels
- Focus management
- Keyboard navigation
- Screen-reader announcements
- Accessible tables and dialogs
- Color-independent status indicators
- Reduced-motion support

Establish measurable bundle-size and performance budgets.

Test the application with realistic record volumes rather than only small fixture datasets.

Avoid applying expensive animations or heavy chart libraries across unnecessary routes.

---

## 22. COMPLETE IMPLEMENTATION ORDER

Execute the entire frontend implementation in the following milestones.

### M0 — Existing application audit and setup

Audit, dependency compatibility, engineering structure and implementation register.

### M1 — Shared product foundation

Design system, navigation, application shells, routing, authentication, tenant context, entitlements, API infrastructure and synthetic persistence.

### M2 — SaaS platform and hospital governance

D01–D08 and associated administrative screens.

### M3 — Patient access

D09–D12, registration, appointments, QR check-in and smart queues.

### M4 — Clinical departments

D13–D19, consultations, medical records, IPD, nursing, emergency, ICU, OT, beds and discharge.

### M5 — Diagnostics and medication

D20–D23 and all connected laboratory, radiology, pharmacy and blood bank workflows.

### M6 — Finance

D24–D26, billing, payments, insurance and financial reconciliation.

### M7 — Hospital operations

D27–D32, inventory, procurement, workforce, assets and support services.

### M8 — Healthcare growth and intelligence

D33–D36, CRM, marketing, analytics, AI and automation interfaces.

### M9 — Complete patient and integration experiences

Patient mobile application, public booking, consent workflows, cross-hospital medical records, integration portal, kiosks and public queue displays.

### M10 — Product-wide integration and quality assurance

Complete all missing screens, cross-module dependencies, responsive behavior, accessibility, state transitions and workflow tests.

### M11 — Final frontend delivery

Complete documentation, route inventory, API contracts, coverage reports, deployment configuration and backend integration readiness.

**Milestones are implementation checkpoints, not stopping points.**

After completing a milestone, continue to the next one without requesting ordinary approval.

Do not stop after creating the first dashboard.

Do not reduce the scope to an MVP.

Do not rebuild completed work unnecessarily.

---

## 23. QUALITY ASSURANCE AND ACCEPTANCE CRITERIA

Every implemented screen must be evaluated against:

- Visual quality
- Functional completeness
- Correct navigation
- Realistic data population
- Valid business rules
- Proper state transitions
- Functional actions
- Search and filtering
- Pagination
- Form validation
- Data persistence
- Tenant-aware behavior
- Facility-aware behavior
- Permission-aware behavior
- Cross-module synchronization
- Loading states
- Empty states
- Error handling
- Responsive layouts
- Accessibility
- Performance
- API integration readiness

### Automated testing requirements

Use Vitest for unit and component tests.

Use Playwright for end-to-end tests.

Use axe-core for automated accessibility checks.

Test critical failure scenarios:

- Duplicate patient registration
- Appointment slot conflicts
- Duplicate QR check-in
- Unauthorized patient access
- Disabled module access
- Cross-tenant data access
- Bed allocation conflict
- Insufficient pharmacy stock
- Duplicate payment requests
- Expired consent
- Revoked consent
- Integration failure
- Unavailable doctor
- Session expiry
- Interrupted network requests

Run the application and inspect actual rendered screens.

Do not mark a module complete merely because its source code compiles.

---

## 24. PRODUCT ENGINEERING DOCUMENTATION

Create and continuously maintain:

```text
docs/
├── PRODUCT_SCOPE.md
├── FRONTEND_ARCHITECTURE.md
├── DESIGN_SYSTEM.md
├── DASHBOARD_REGISTRY.md
├── SCREEN_INVENTORY.md
├── MODULE_COVERAGE.md
├── API_CONTRACTS.md
├── openapi.yaml
├── DOMAIN_MODEL.md
├── MOCK_DATA_ARCHITECTURE.md
├── WORKFLOW_SPECIFICATIONS.md
├── TENANT_CONFIGURATION.md
├── AUTHORIZATION_MATRIX.md
├── ACCESSIBILITY_REPORT.md
├── TEST_REPORT.md
├── BACKEND_INTEGRATION_READINESS.md
├── FRONTEND_IMPLEMENTATION_STATUS.md
└── DEPLOYMENT_GUIDE.md
```

The implementation status register must contain:

- Requirement ID
- Dashboard ID
- Screen ID
- Route
- Implementation status
- API coverage
- Workflow coverage
- Test evidence
- Accessibility findings
- Outstanding issues

Do not report functionality as complete without supporting implementation and verification evidence.

---

## 25. FINAL PRODUCT COMPLETION REQUIREMENTS

TrueCare frontend implementation is complete only when:

1. All 36 dashboards are implemented.
2. All applicable product modules are implemented.
3. The complete functional screen inventory is covered.
4. All important user responsibilities have appropriate workspaces.
5. Every important screen contains realistic initial data.
6. All primary buttons and actions work.
7. Mock REST APIs are implemented.
8. Synthetic domain records remain relationally consistent.
9. Data changes persist across refreshes.
10. Cross-module workflows operate correctly.
11. Tenant and facility configurations dynamically resolve features.
12. Patient medical history and consent workflows are connected.
13. Appointment booking, QR check-in and queues work together.
14. Clinical, diagnostic, pharmacy and financial workflows are linked.
15. Patient mobile experiences are complete.
16. Hospital administration and SaaS administration are complete.
17. Accessible responsive layouts have been tested.
18. Frontend contracts are ready for Spring Boot implementation.
19. Tests and build verification have been executed.
20. Remaining limitations are explicitly documented.

---

## 26. FINAL EXECUTION INSTRUCTION

Begin implementation immediately.

Audit the existing repository, identify missing requirements and implement them in a logical sequence.

Build TrueCare as an actual premium enterprise healthcare frontend, not as a visual prototype.

Use realistic synthetic data and functional REST API handlers until the production backend is available.

Prioritize complete user experiences, domain correctness, reusable architecture, accessible interactions and cross-module consistency.

Continue through all 36 dashboards and the complete product scope.

Do not stop after one module.

Do not repeatedly request permission to proceed.

If an execution or context limit interrupts implementation, preserve completed work and write an exact continuation checkpoint identifying the remaining requirements and next action.

Do not claim completion prematurely.

**BEGIN COMPLETE TRUECARE FRONTEND PRODUCT IMPLEMENTATION.**