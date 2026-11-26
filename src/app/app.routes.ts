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
    path: 'unavailable',
    data: { unavailable: true },
    loadComponent: () => import('./layouts/boundary').then((m) => m.Boundary),
  },
  { path: 'denied', loadComponent: () => import('./layouts/boundary').then((m) => m.Boundary) },
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
        path: 'pharmacy',
        data: { resource: 'pharmacy' },
        canActivate: [workspaceAccess],
        loadComponent: () => import('./features/pharmacy').then((m) => m.Pharmacy),
        title: 'Pharmacy · TrueCare',
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
    ],
  },
  { path: '**', redirectTo: '' },
];
