# Accessibility report

The automated Chromium axe checks in `e2e/operations.spec.ts` cover selected WCAG 2 A, AA and WCAG 2.1 AA rules. The tested views include sign-in, hospital overview, mobile patient home, subscriptions, network performance, platform operations, pharmacy stock, connector administration, mobile patient record sharing, clinical governance, the quality register and reception scheduling. Reflow is checked at 390, 768, 1024 and 1440 px for the overview, connector administration, recipient requests, patient record sharing, clinical governance, quality register, and reception and executive scheduling. [Test report](TEST_REPORT.md)

A mobile table initially failed keyboard scroll access. Scroll regions now have a clear label and a focus target. The mobile navigation check confirms initial focus and restoration after Escape. Clinical review and waitlist intake open with Enter and restore focus to their worklist buttons after Escape. Reports use text statuses and the patient flow chart has a table alternative. The default dashboard follows the reduced-motion system setting.

Reception scheduling also passed automated axe and reflow checks at 390 px in a separate touch-enabled Chromium context. The mobile waitlist scrolls within its labelled table region. [Mobile scheduling screenshot](screenshots/scheduling-390.png)

The consultation history and follow-up dialog and the patient’s follow-up view passed automated axe checks. The Chromium journey checks both workspaces at 390, 768, 1024 and 1440 px. [Consultation screenshot](screenshots/consultation-continuity-desktop.png) · [Mobile follow-up screenshot](screenshots/follow-up-390.png)

The physician care plan at 1440 px and the nursing plan at 390 px passed automated axe checks. Both views were checked at 390, 768, 1024 and 1440 px. The order dialog opens with Enter and restores focus after Escape. The nursing task action remains visible at 390 px with its last update shown under the task. [Physician workspace](screenshots/inpatient-physician-1440.png) · [Mobile nursing station](screenshots/nursing-station-390.png)

Emergency, critical care and Theatre passed reflow checks at 390, 768, 1024 and 1440 px. The emergency view at 390 px and the two desktop views passed the selected axe rules. The emergency assessment dialog opens with Enter and restores focus after Escape. [Mobile emergency](screenshots/emergency-390.png) · [Critical care](screenshots/critical-care-1440.png) · [Operation Theatre](screenshots/operation-theatre-1440.png)

The patient Reports view and inpatient accounts worklist passed reflow checks at 390, 768, 1024 and 1440 px. The released summary at 390 px and the bed ledger at 1440 px passed the selected axe rules. Enter opens the ledger, Escape restores focus to the account action, and issuing an invoice moves focus to the Invoices view control. [Mobile discharge summary](screenshots/discharge-summary-390.png) · [Bed charge ledger](screenshots/inpatient-billing-1440.png)

The Radiology schedule and Blood Bank worklist passed reflow checks at 390, 768, 1024 and 1440 px. The desktop schedule, mobile released imaging report and mobile unit review passed the selected axe rules. Enter opens the scheduling and reservation dialogs and Escape restores focus to their row actions. [Modality schedule](screenshots/radiology-schedule-1440.png) · [Imaging report](screenshots/imaging-report-390.png) · [Blood Bank review](screenshots/blood-bank-review-390.png)

The stock activity ledger and patient medication history passed reflow checks at 390, 768, 1024 and 1440 px. The ledger at 1440 px and medication history at 390 px passed the selected axe rules. Enter opens the stock receipt dialog and Escape restores focus to the receipt action. [Pharmacy stock ledger](screenshots/pharmacy-ledger-1440.png) · [Mobile patient medication history](screenshots/patient-medications-390.png)

A complete WCAG review still requires keyboard-only journeys in every workspace, manual screen-reader testing, zoom and text-spacing checks, and current Firefox and WebKit coverage.
