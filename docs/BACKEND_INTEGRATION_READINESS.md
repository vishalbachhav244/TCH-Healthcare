# Backend integration readiness

The application has a typed Angular HTTP client, a local REST adapter and versioned contract under `/api/v1`. This permits endpoint-by-endpoint replacement by Spring Boot while retaining the user interface. The reference adapter uses IndexedDB transactions for conflicts and stale versions.

Implement the Spring Boot identity and facility endpoints before activating signed-in routes on remote hosts. Introduce OIDC session handling and authoritative role, entitlement, facility and patient access checks. Use versioned writes, server idempotency, protected assets and audited consent. Establish schema validation, OAuth error handling, persistence, asynchronous notifications and SSE event delivery.

The evaluation contract has scoped browser invalidation and a limited error shape. Complete DTO validation, domain-wide endpoint parity, production error codes, live scheduling and several operational modules remain open. [OpenAPI](openapi.yaml)
