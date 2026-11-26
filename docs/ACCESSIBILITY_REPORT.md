# Accessibility report

The automated Chromium axe checks in `e2e/operations.spec.ts` cover selected WCAG 2 A, AA and WCAG 2.1 AA rules. The tested views are desktop sign-in, desktop and mobile hospital overview, the 390 px patient home, subscriptions, network performance, platform operations and pharmacy stock. Dashboard reflow is checked at 390, 768, 1024 and 1440 px. See the [test report](TEST_REPORT.md) for the results.

A mobile table initially failed keyboard scroll access. Scroll regions now have a clear label and a focus target. The mobile navigation check confirms initial focus and restoration after Escape. Reports use text statuses and the patient flow chart has a table alternative. The default dashboard follows the reduced-motion system setting.

A complete WCAG review still requires keyboard-only journeys in every workspace, manual screen-reader testing, zoom and text-spacing checks, and current Firefox and WebKit coverage.
