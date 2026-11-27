import { inject } from '@angular/core';
import { Router, type CanActivateFn, type Routes } from '@angular/router';
import { evaluationAvailable } from './core/evaluation';
import { SessionStore } from './core/session';
import type { Resource } from './domain/workspaces';

const workspaceAccess: CanActivateFn = async (route) => {
  const router = inject(Router);
  const store = inject(SessionStore);
  if (!evaluationAvailable) return router.parseUrl('/unavailable');
  await store.restore();
  if (!store.session()) return router.parseUrl('/sign-in');
  const resource = route.data['resource'] as Resource | undefined;
  if (resource && !store.allowed(resource)) return router.parseUrl('/denied');
  return true;
};

const entry: CanActivateFn = async () => {
  const router = inject(Router);
  const store = inject(SessionStore);
  if (!evaluationAvailable) return router.parseUrl('/unavailable');
  await store.restore();
  return router.parseUrl(store.session() ? store.home() : '/sign-in');
};

const evaluationAccess: CanActivateFn = () =>
  evaluationAvailable || inject(Router).parseUrl('/unavailable');

const publicDiscovery: CanActivateFn = async () => {
  const router = inject(Router);
  const session = inject(SessionStore);
  if (!evaluationAvailable) return router.parseUrl('/unavailable');
  await session.restore();
  return true;
};

const patientEnrollment: CanActivateFn = async () => {
  const router = inject(Router);
  const session = inject(SessionStore);
  if (!evaluationAvailable) return router.parseUrl('/unavailable');
  await session.restore();
  return session.session() ? router.parseUrl(session.home()) : true;
};

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [entry],
    loadComponent: () => import('./layouts/boundary').then((m) => m.Boundary),
  },
  {
    path: 'sign-in',
    loadComponent: () => import('./features/sign-in').then((m) => m.SignIn),
    title: 'Sign in · TrueCare',
  },
  {
    path: 'register',
    canActivate: [patientEnrollment],
    loadComponent: () =>
      import('./features/patient-registration').then((m) => m.PatientRegistrationPage),
    title: 'Create a patient account · TrueCare',
  },
  {
    path: 'unavailable',
    data: { unavailable: true },
    loadComponent: () => import('./layouts/boundary').then((m) => m.Boundary),
  },
  { path: 'denied', loadComponent: () => import('./layouts/boundary').then((m) => m.Boundary) },
  {
    path: 'find-care',
    canActivate: [publicDiscovery],
    loadComponent: () => import('./features/care-discovery').then((m) => m.CareDiscovery),
    title: 'Find care · TrueCare',
  },
  {
    path: 'kiosk/:facility',
    canActivate: [evaluationAccess],
    loadComponent: () => import('./features/check-in-kiosk').then((m) => m.CheckInKiosk),
    title: 'Self-service check-in · TrueCare',
  },
  {
    path: 'display/:facility',
    loadComponent: () => import('./features/queue-display').then((m) => m.QueueDisplay),
    title: 'Queue Display · TrueCare',
  },
  {
    path: 'work',
    canActivate: [workspaceAccess],
    loadComponent: () => import('./layouts/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: '/' },
      {
        path: 'platform',
        data: { resource: 'platform' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/platform').then((m) => m.Platform),
        title: 'Organizations · TrueCare',
      },
      {
        path: 'overview',
        data: { resource: 'overview' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/overview').then((m) => m.Overview),
        title: 'Hospital Overview · TrueCare',
      },
      {
        path: 'subscriptions',
        data: { resource: 'subscriptions' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/subscriptions').then((m) => m.Subscriptions),
        title: 'Subscriptions · TrueCare',
      },
      {
        path: 'platform-operations',
        data: { resource: 'platform-operations' },
        canActivate: [workspaceAccess],
        loadComponent: () =>
          import('./features/platform-operations').then((m) => m.PlatformOperations),
        title: 'Platform Operations · TrueCare',
      },
      {
        path: 'network',
        data: { resource: 'network' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/network').then((m) => m.Network),
        title: 'Network Performance · TrueCare',
      },
      {
        path: 'integrations',
        data: { resource: 'integrations' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/integrations').then((m) => m.Integrations),
        title: 'Integrations · TrueCare',
      },
      {
        path: 'record-requests',
        data: { resource: 'record-requests' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/record-requests').then((m) => m.RecordRequests),
        title: 'Record Requests · TrueCare',
      },
      {
        path: 'clinical-governance',
        data: { resource: 'clinical-governance' },
        canActivate: [workspaceAccess],
        loadComponent: () =>
          import('./features/clinical-governance').then((m) => m.ClinicalGovernance),
        title: 'Clinical Governance · TrueCare',
      },
      {
        path: 'quality',
        data: { resource: 'quality' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/quality-register').then((m) => m.QualityRegister),
        title: 'Quality & Compliance · TrueCare',
      },
      {
        path: 'appointments',
        data: { resource: 'appointments' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/access-worklist').then((m) => m.AccessWorklist),
        title: 'Appointments · TrueCare',
      },
      {
        path: 'scheduling',
        data: { resource: 'scheduling' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/scheduling').then((m) => m.Scheduling),
        title: 'Scheduling · TrueCare',
      },
      {
        path: 'queue',
        data: { resource: 'queue' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/access-worklist').then((m) => m.AccessWorklist),
        title: 'Consultation Queue · TrueCare',
      },
      {
        path: 'clinical',
        data: { resource: 'clinical' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/access-worklist').then((m) => m.AccessWorklist),
        title: 'Clinical Workspace · TrueCare',
      },
      {
        path: 'patients',
        data: { resource: 'patients' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/patients').then((m) => m.Patients),
        title: 'Patient Registry · TrueCare',
      },
      {
        path: 'inpatient-physician',
        data: { resource: 'inpatient-physician' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/ward-care').then((m) => m.WardCare),
        title: 'Inpatient Physician · TrueCare',
      },
      {
        path: 'nursing-station',
        data: { resource: 'nursing-station' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/ward-care').then((m) => m.WardCare),
        title: 'Nursing Station · TrueCare',
      },
      {
        path: 'emergency',
        data: { resource: 'emergency' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/acute-workspace').then((m) => m.AcuteWorkspacePage),
        title: 'Emergency · TrueCare',
      },
      {
        path: 'critical-care',
        data: { resource: 'critical-care' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/acute-workspace').then((m) => m.AcuteWorkspacePage),
        title: 'ICU & Critical Care · TrueCare',
      },
      {
        path: 'operation-theatre',
        data: { resource: 'operation-theatre' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/acute-workspace').then((m) => m.AcuteWorkspacePage),
        title: 'Operation Theatre · TrueCare',
      },
      {
        path: 'beds',
        data: { resource: 'beds' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/beds').then((m) => m.Beds),
        title: 'Bed Management · TrueCare',
      },
      {
        path: 'laboratory',
        data: { resource: 'laboratory' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/laboratory').then((m) => m.Laboratory),
        title: 'Laboratory · TrueCare',
      },
      {
        path: 'radiology',
        data: { resource: 'radiology' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/radiology').then((m) => m.Radiology),
        title: 'Radiology & Imaging · TrueCare',
      },
      {
        path: 'pharmacy',
        data: { resource: 'pharmacy' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/pharmacy').then((m) => m.Pharmacy),
        title: 'Pharmacy · TrueCare',
      },
      {
        path: 'blood-bank',
        data: { resource: 'blood-bank' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/blood-bank').then((m) => m.BloodBank),
        title: 'Blood Bank · TrueCare',
      },
      {
        path: 'portal',
        data: { resource: 'portal' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/portal').then((m) => m.Portal),
        title: 'My Care · TrueCare',
      },
      {
        path: 'billing',
        data: { resource: 'billing' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/billing').then((m) => m.Billing),
        title: 'Revenue Cycle · TrueCare',
      },
      {
        path: 'finance',
        data: { resource: 'finance' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/finance').then((m) => m.Finance),
        title: 'Finance & Revenue · TrueCare',
      },
      {
        path: 'insurance',
        data: { resource: 'insurance' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/insurance').then((m) => m.Insurance),
        title: 'Insurance & TPA · TrueCare',
      },
      {
        path: 'inventory',
        data: { resource: 'inventory' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/inventory').then((m) => m.Inventory),
        title: 'Inventory & Stores · TrueCare',
      },
      {
        path: 'procurement',
        data: { resource: 'procurement' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/procurement').then((m) => m.Procurement),
        title: 'Procurement · TrueCare',
      },
      {
        path: 'workforce',
        data: { resource: 'workforce' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/workforce').then((m) => m.Workforce),
        title: 'HR & Workforce · TrueCare',
      },
      {
        path: 'biomedical',
        data: { resource: 'biomedical' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/biomedical').then((m) => m.Biomedical),
        title: 'Biomedical Engineering · TrueCare',
      },
      {
        path: 'hospital-support',
        data: { resource: 'hospital-support' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/hospital-support').then((m) => m.HospitalSupport),
        title: 'Hospital Support Services · TrueCare',
      },
      {
        path: 'patient-transport',
        data: { resource: 'patient-transport' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/patient-transport').then((m) => m.PatientTransport),
        title: 'Ambulance & Patient Transport · TrueCare',
      },
      {
        path: 'crm',
        data: { resource: 'crm' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/crm').then((m) => m.Crm),
        title: 'CRM & Contact Center · TrueCare',
      },
      {
        path: 'marketing',
        data: { resource: 'marketing' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/marketing').then((m) => m.Marketing),
        title: 'Marketing & Engagement · TrueCare',
      },
      {
        path: 'analytics',
        data: { resource: 'analytics' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/analytics').then((m) => m.Analytics),
        title: 'Enterprise Analytics & BI · TrueCare',
      },
      {
        path: 'automation',
        data: { resource: 'automation' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/automation').then((m) => m.Automation),
        title: 'AI & Automation Control Center · TrueCare',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
