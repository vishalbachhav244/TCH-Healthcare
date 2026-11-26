# Domain model

A facility belongs to a tenant organization with a subscription plan. A facility has versioned inpatient access. A patient has a tenant-local ID. A practitioner is assigned to a facility and specialty. An appointment links a patient and practitioner. A queue ticket points to the checked-in appointment. An encounter identifies a consultation, its practitioner and its signed observation.

An outpatient invoice links a signed encounter, line items and posted payments. A laboratory order links an encounter with an accession, finding, review and publication state. Admissions track bed ownership separately and preserve the allocated bed reference after discharge. A patient session may find records only for its own patient identity and facility.

The TypeScript contracts live in [operations.ts](../src/app/domain/operations.ts), [diagnostics.ts](../src/app/domain/diagnostics.ts) and [portal.ts](../src/app/domain/portal.ts). Broader entities such as consent grants, prescription stock movements and imported record references remain open.
