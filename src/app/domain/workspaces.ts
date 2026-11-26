export type Resource =
  | 'platform'
  | 'subscriptions'
  | 'platform-operations'
  | 'integrations'
  | 'record-requests'
  | 'clinical-governance'
  | 'quality'
  | 'network'
  | 'overview'
  | 'appointments'
  | 'scheduling'
  | 'patients'
  | 'queue'
  | 'clinical'
  | 'inpatient-physician'
  | 'nursing-station'
  | 'emergency'
  | 'critical-care'
  | 'operation-theatre'
  | 'beds'
  | 'billing'
  | 'laboratory'
  | 'radiology'
  | 'blood-bank'
  | 'pharmacy'
  | 'portal';

interface Workspace {
  id: string;
  title: string;
  group: string;
  icon: string;
  resource?: Resource;
  inpatient?: boolean;
}

export const workspaces: readonly Workspace[] = [
  {
    id: 'D01',
    title: 'SaaS Super Admin',
    group: 'Platform',
    icon: 'building',
    resource: 'platform',
  },
  {
    id: 'D02',
    title: 'Customer Success & Subscriptions',
    group: 'Platform',
    icon: 'wallet',
    resource: 'subscriptions',
  },
  {
    id: 'D03',
    title: 'Platform Operations',
    group: 'Platform',
    icon: 'activity',
    resource: 'platform-operations',
  },
  {
    id: 'D04',
    title: 'Interoperability & Integration',
    group: 'Platform',
    icon: 'network',
    resource: 'integrations',
  },
  {
    id: 'D05',
    title: 'Healthcare Network Executive',
    group: 'Governance',
    icon: 'activity',
    resource: 'network',
  },
  {
    id: 'D06',
    title: 'Hospital Overview',
    group: 'Governance',
    icon: 'layout',
    resource: 'overview',
  },
  {
    id: 'D07',
    title: 'Medical Director',
    group: 'Governance',
    icon: 'stethoscope',
    resource: 'clinical-governance',
  },
  {
    id: 'D08',
    title: 'Quality & Compliance',
    group: 'Governance',
    icon: 'shield',
    resource: 'quality',
  },
  {
    id: 'D09',
    title: 'Front Desk & Reception',
    group: 'Patient access',
    icon: 'users',
    resource: 'patients',
  },
  {
    id: 'D10',
    title: 'Appointments & Scheduling',
    group: 'Patient access',
    icon: 'calendar',
    resource: 'appointments',
  },
  {
    id: 'D11',
    title: 'Smart Queue Command Center',
    group: 'Patient access',
    icon: 'list',
    resource: 'queue',
  },
  {
    id: 'D12',
    title: 'Patient & Family',
    group: 'Patient access',
    icon: 'heart',
    resource: 'portal',
  },
  {
    id: 'D13',
    title: 'Doctor / OPD Workspace',
    group: 'Clinical',
    icon: 'stethoscope',
    resource: 'clinical',
  },
  {
    id: 'D14',
    title: 'IPD Physician Workspace',
    group: 'Clinical',
    icon: 'clipboard',
    inpatient: true,
    resource: 'inpatient-physician',
  },
  {
    id: 'D15',
    title: 'Nursing Station',
    group: 'Clinical',
    icon: 'heart',
    inpatient: true,
    resource: 'nursing-station',
  },
  {
    id: 'D16',
    title: 'Emergency / Casualty',
    group: 'Clinical',
    icon: 'activity',
    inpatient: true,
    resource: 'emergency',
  },
  {
    id: 'D17',
    title: 'ICU & Critical Care',
    group: 'Clinical',
    icon: 'activity',
    inpatient: true,
    resource: 'critical-care',
  },
  {
    id: 'D18',
    title: 'Operation Theatre',
    group: 'Clinical',
    icon: 'calendar',
    inpatient: true,
    resource: 'operation-theatre',
  },
  {
    id: 'D19',
    title: 'Admission, Bed & Discharge',
    group: 'Clinical',
    icon: 'bed',
    resource: 'beds',
    inpatient: true,
  },
  {
    id: 'D20',
    title: 'Laboratory / LIMS',
    group: 'Diagnostics',
    icon: 'flask',
    resource: 'laboratory',
  },
  {
    id: 'D21',
    title: 'Radiology & Imaging',
    group: 'Diagnostics',
    icon: 'scan',
    resource: 'radiology',
  },
  { id: 'D22', title: 'Pharmacy', group: 'Diagnostics', icon: 'cross', resource: 'pharmacy' },
  {
    id: 'D23',
    title: 'Blood Bank',
    group: 'Diagnostics',
    icon: 'heart',
    resource: 'blood-bank',
    inpatient: true,
  },
  {
    id: 'D24',
    title: 'Patient Billing & Cashier',
    group: 'Finance',
    icon: 'wallet',
    resource: 'billing',
  },
  { id: 'D25', title: 'Finance & Revenue', group: 'Finance', icon: 'chart' },
  { id: 'D26', title: 'Insurance & TPA', group: 'Finance', icon: 'shield' },
  { id: 'D27', title: 'Inventory & Stores', group: 'Operations', icon: 'box' },
  { id: 'D28', title: 'Procurement', group: 'Operations', icon: 'clipboard' },
  { id: 'D29', title: 'HR & Workforce', group: 'Operations', icon: 'users' },
  { id: 'D30', title: 'Asset & Biomedical Engineering', group: 'Operations', icon: 'settings' },
  { id: 'D31', title: 'Hospital Support Services', group: 'Operations', icon: 'layers' },
  { id: 'D32', title: 'Ambulance & Patient Transport', group: 'Operations', icon: 'activity' },
  { id: 'D33', title: 'Healthcare CRM & Contact Center', group: 'Engagement', icon: 'users' },
  { id: 'D34', title: 'Marketing & Engagement', group: 'Engagement', icon: 'heart' },
  { id: 'D35', title: 'Enterprise Analytics & BI', group: 'Intelligence', icon: 'chart' },
  { id: 'D36', title: 'AI & Automation Control Center', group: 'Intelligence', icon: 'settings' },
];

export const inpatientWorkspaces = new Set(
  workspaces.filter((workspace) => workspace.inpatient).map((workspace) => workspace.id),
);

export const navigation = [
  { title: 'Organizations', resource: 'platform', icon: 'building', workspace: 'D01' },
  { title: 'Subscriptions', resource: 'subscriptions', icon: 'wallet', workspace: 'D02' },
  {
    title: 'Platform operations',
    resource: 'platform-operations',
    icon: 'activity',
    workspace: 'D03',
  },
  { title: 'Integrations', resource: 'integrations', icon: 'network', workspace: 'D04' },
  { title: 'Record requests', resource: 'record-requests', icon: 'clipboard', workspace: 'D04' },
  { title: 'Network performance', resource: 'network', icon: 'activity', workspace: 'D05' },
  { title: 'Overview', resource: 'overview', icon: 'layout', workspace: 'D06' },
  {
    title: 'Clinical governance',
    resource: 'clinical-governance',
    icon: 'stethoscope',
    workspace: 'D07',
  },
  { title: 'Quality & compliance', resource: 'quality', icon: 'shield', workspace: 'D08' },
  { title: 'Appointments', resource: 'appointments', icon: 'calendar', workspace: 'D10' },
  { title: 'Scheduling', resource: 'scheduling', icon: 'clock', workspace: 'D10' },
  { title: 'Patients', resource: 'patients', icon: 'users', workspace: 'D09' },
  { title: 'Consultation queue', resource: 'queue', icon: 'list', workspace: 'D11' },
  { title: 'Clinical workspace', resource: 'clinical', icon: 'stethoscope', workspace: 'D13' },
  {
    title: 'Inpatient physician',
    resource: 'inpatient-physician',
    icon: 'clipboard',
    workspace: 'D14',
  },
  { title: 'Nursing station', resource: 'nursing-station', icon: 'heart', workspace: 'D15' },
  { title: 'Emergency', resource: 'emergency', icon: 'activity', workspace: 'D16' },
  { title: 'ICU & critical care', resource: 'critical-care', icon: 'activity', workspace: 'D17' },
  { title: 'Operation theatre', resource: 'operation-theatre', icon: 'calendar', workspace: 'D18' },
  { title: 'Bed management', resource: 'beds', icon: 'bed', workspace: 'D19' },
  { title: 'Laboratory', resource: 'laboratory', icon: 'flask', workspace: 'D20' },
  { title: 'Radiology & imaging', resource: 'radiology', icon: 'scan', workspace: 'D21' },
  { title: 'Pharmacy', resource: 'pharmacy', icon: 'cross', workspace: 'D22' },
  { title: 'Blood bank', resource: 'blood-bank', icon: 'heart', workspace: 'D23' },
  { title: 'Revenue cycle', resource: 'billing', icon: 'wallet', workspace: 'D24' },
  { title: 'My care', resource: 'portal', icon: 'heart', workspace: 'D12' },
] as const;

export const platformResources: readonly string[] = [
  'platform',
  'subscriptions',
  'platform-operations',
  'integrations',
  'record-requests',
];
