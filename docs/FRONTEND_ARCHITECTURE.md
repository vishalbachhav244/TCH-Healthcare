# Frontend architecture

Standalone Angular 22.3.0 uses strict TypeScript 6.0.3, RxJS 7.8.2, pinned Node 24.22.3, on-push views and lazy feature routes. The shell resolves links from session membership and facility capabilities. Individual routes and each evaluation REST operation perform their own scope checks.

The request path is feature component → scoped query signal or action → Api service → HttpClient → local interceptor → typed handler → Dexie transaction. Read queries unsubscribe when their parameters change. Commands use atomic read/write transactions. The event store keeps typed event payloads. Cross-tab notifications carry invalidation metadata so subscribers can re-query their authorised data and re-evaluate available workspaces when facility configuration changes.

**DEMO ONLY — backend will enforce.** Session tokens, facility access, appointment ownership and clinical roles are evaluated locally. Current response checks validate top-level shape and selected required keys. Future DTO validation should check all fields. [Backend integration readiness](BACKEND_INTEGRATION_READINESS.md)
