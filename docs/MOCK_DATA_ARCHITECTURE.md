# Synthetic data architecture

The local adapter seeds the first open with a facility-local reference date. The generator can also take a fixed date and a small profile for tests. Facility and tenant records anchor the relationships. Appointments create associated queue tickets, encounters, laboratory records and invoice/payment rows where appropriate. Seeded names are fictional and have no contact details. Registration creates profiles from constrained evaluation codes. Clinical observations and laboratory findings are limited to enumerated synthetic values.

Dexie version migrations preserve writes and populate new data tables. The database persists for the current browser origin. Date changes and account changes do not reseed it. For a clean evaluation, use a fresh browser profile. To explicitly reset this project's data after preserving anything needed, close all TrueCare tabs and remove only the `truecare-evaluation-v1` IndexedDB database and this origin's sessionStorage entries using browser developer tools. Reopen the app to seed a new reference date.

Defer arbitrary free-text entry and document uploads until a suitable data boundary exists. The QR reader decodes a bounded image locally and retains only a valid opaque pass code.

Schema version 17 carries forward the verified occupied bed of each active admission. If a legacy admission was transferred, the latest recorded transfer starts the current segment. If its transfer time is unavailable, tracking begins at upgrade. Those ledgers require cashier acknowledgement of partial coverage. Historical admissions already discharged keep their original records. No bed charges are generated for those closed stays.

Schema version 18 adds imaging orders, component requests and individual units. Upgrades retain existing records and add the named diagnostic memberships where their facility exists. Sample imaging orders link older signed encounters and exclude the named patient-portal account. Stock includes in-date and expired units for inpatient facilities. Compatibility is a structured synthetic reviewer decision. The fixture does not contain donor or blood group data.

Schema version 19 labels existing pharmacy movements as dispensing and establishes each lot’s opening balance from its stored on-hand quantity and dispense history. Existing invoices and payments retain their values. New pharmacy views calculate on-hand and quarantine counts from movements. The adapter maintains the stored on-hand quantity in the same transaction for legacy readers. References for stock receipts and returns are unique per facility.

Schema version 20 adds refund decisions, daily collection closes, coverage and claims. Existing payments keep their recorded values. A unique claim ID identifies payer payments. The upgrade adds the named Finance and Insurance memberships at their existing facilities. All payer decisions and payment movements in the evaluation remain local synthetic records.

Schema version 21 adds facility supplier catalogues, requisitions, orders and goods receipts. Existing lots and movements remain available to Stores and Pharmacy. Supplier costs are fixed synthetic catalogue values. Goods receipts reuse the pharmacy lot transaction, and stock counts append the measured difference to the existing ledger.
