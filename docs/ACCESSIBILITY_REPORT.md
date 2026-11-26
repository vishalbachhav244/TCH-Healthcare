# Accessibility report

The automated Chromium axe checks in `e2e/operations.spec.ts` cover selected WCAG 2 A, AA and WCAG 2.1 AA rules. The tested views include sign-in, hospital overview, mobile patient home, subscriptions, network performance, platform operations, pharmacy stock, connector administration, mobile patient record sharing, clinical governance and the quality register. Reflow is checked at 390, 768, 1024 and 1440 px for the overview, connector administration, recipient requests, patient record sharing, clinical governance and quality register. [Test report](TEST_REPORT.md)

A mobile table initially failed keyboard scroll access. Scroll regions now have a clear label and a focus target. The mobile navigation check confirms initial focus and restoration after Escape. The clinical review opens with Enter and restores focus to its worklist button after Escape. Reports use text statuses and the patient flow chart has a table alternative. The default dashboard follows the reduced-motion system setting.

A complete WCAG review still requires keyboard-only journeys in every workspace, manual screen-reader testing, zoom and text-spacing checks, and current Firefox and WebKit coverage.
