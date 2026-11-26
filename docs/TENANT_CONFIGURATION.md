# Tenant configuration

The evaluation fixture includes six facilities across five tenants. Meridian network access spans its two facilities. Sunrise Clinic and Horizon Polyclinic start on a Clinic plan. A platform administrator can add organizations and inactive facilities, activate a facility, configure inpatient access and assign existing staff accounts individually by facility. Clinician grants require an assigned practitioner. Multiple active accounts cannot share the same practitioner at one facility.

Facility entitlement and staff membership versions prevent stale configuration writes. Authorization is projected for each request, and commands reload it inside the mutation transaction. Changing activation or membership refreshes open staff tabs. Customer success can review accounts and change compatible plans. A Clinic downgrade requires inpatient access to be disabled at every facility first. Department setup, new staff account creation and additional entitlement policies remain open.

Route coverage, account assignments and guard tests are in the [authorization matrix](AUTHORIZATION_MATRIX.md).
