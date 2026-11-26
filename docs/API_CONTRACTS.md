# API contracts

The evaluation adapter handles `/api/v1/*` through Angular HttpClient. [OpenAPI](openapi.yaml) describes the operations currently handled. The adapter accepts an opaque bearer token and, for facility requests, `X-Facility-Id`. Command responses include an entity ID and a pass only on approved issuance commands.

The appointments, queue, clinical and laboratory worklists use zero-based offsets and a 12-row page. Patient search and booking options return at most 35 matches. Billing and other scopes use the endpoint-specific limits described in the contract. 400-series responses include a plain-language message. Stale admission and result writes, double booking, replayed passes and duplicate payments return 409.

Facility-local dates are ISO calendar days in Asia/Kolkata. Appointment times are 24-hour local strings. Current event timestamps are epoch milliseconds. Money uses integer INR minor units.

Discharge summary commands check the admission, team and draft versions. The portal and Admissions can read a summary after release. Inpatient charge list and detail responses expose the admission account and its bed charges. Invoice creation uses the frozen ledger, requires acknowledgement for partial coverage and returns 409 if the admission already has an invoice.

Imaging writes check the assigned encounter or the applicable technician and reviewer scope. Modality and patient conflicts return 409. Ordering clinician and portal responses include the report summary after the reviewer releases it. Blood component commands verify the active admission and current versions. Reserve and issue validate facility, component, expiry and custody.

Pharmacy receipts, supplier returns and patient returns record a facility-scoped stock movement. Reference codes are case-insensitive. Receipt and return quantities are positive whole numbers at the command boundary. The ledger records direction and quarantine separately. Billing and portal responses expose credited and review amounts. Local settlement captures the remaining unpaid balance after credits.

The Finance API groups patient and payer payments by posting day and subtracts posted refunds. A medication return review accepts one decision. Collection close compares the counted amount with the current ledger and blocks additional patient, payer or refund postings to the closed day. Insurance commands check facility, invoice, patient, policy date and claim version. Payer settlement posts the approved share. Billing responds with an insurance hold while a claim is open.

Stores records requisitions and batch receipts. Procurement approves or rejects the current requisition and can issue one purchase order with a compatible facility supplier. A receipt validates the current order version, in-date batch and remaining quantity in the same transaction as the stock movement. Count adjustments require the expected lot balance and a unique facility reference.
