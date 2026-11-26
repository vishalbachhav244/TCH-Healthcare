# TrueCare frontend

Use [the enterprise frontend brief](docs/ENTERPRISE_FRONTEND_BRIEF.md) as the source for this independent implementation. Use the dashboard IDs in that brief. Record absent screen and requirement catalogues in the implementation register and leave their coverage unverified until they are supplied.

## Engineering

- Build one standalone Angular application with strict TypeScript, lazy feature routes, typed forms, signals, HttpClient and an accessible shared design system.
- Keep UI, application services, domain rules, API contracts and synthetic persistence separate. Keep tenant, facility, entitlement, account, patient, appointment, queue ticket, encounter, order and invoice identities explicit.
- Implement pages around the work a role needs to do. Calculate KPIs from scoped records. Connect commands to visible persisted state and implement loading, empty, error and denied states.
- Pin stable compatible tools and dependencies with the lockfile. Keep frontend APIs under /api/v1 and document the exact implemented contract for Spring Boot integration.

## Evaluation data and access

- Restrict synthetic authentication, APIs and records to the evaluation boundary. Fail closed on other hosts. Enter only fictional data and keep real records, clinical services, payments, messages and AI providers outside this frontend phase.
- Apply authorization and facility scope on the route and API. Treat local checks as evaluation behavior. Use opaque IDs for QR passes and public tokens, and avoid medical data or credentials in logs.
- Use transactions for related writes. Preserve records across refreshes and expose fixture reset through developer tooling.

## Verification

- Run builds, unit and contract tests, Playwright journeys and accessibility checks using evidence from actual runs. Include denial and conflict cases. Maintain the dashboard, screen and requirement register with the tested behavior and remaining gaps.
- Use authentic operational labels and responsive, readable interfaces with semantic status text. Record handoff checkpoints when delivery is incomplete.
