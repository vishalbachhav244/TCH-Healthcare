# Synthetic data architecture

The local adapter seeds the first open with a facility-local reference date. The generator can also take a fixed date and a small profile for tests. Facility and tenant records anchor the relationships. Appointments create associated queue tickets, encounters, laboratory records and invoice/payment rows where appropriate. Seeded names are fictional and have no contact details. Registration creates profiles from constrained evaluation codes. Clinical observations and laboratory findings are limited to enumerated synthetic values.

Dexie version migrations preserve writes and populate new data tables. The database persists for the current browser origin. Date changes and account changes do not reseed it. For a clean evaluation, use a fresh browser profile. To explicitly reset this project's data after preserving anything needed, close all TrueCare tabs and remove only the `truecare-evaluation-v1` IndexedDB database and this origin's sessionStorage entries using browser developer tools. Reopen the app to seed a new reference date.

Defer arbitrary free-text entry and document uploads until a suitable data boundary exists. The QR reader decodes a bounded image locally and retains only a valid opaque pass code.

Schema version 17 carries forward the verified occupied bed of each active admission. If a legacy admission was transferred, the latest recorded transfer starts the current segment. If its transfer time is unavailable, tracking begins at upgrade. Those ledgers require cashier acknowledgement of partial coverage. Historical admissions already discharged keep their original records. No bed charges are generated for those closed stays.
