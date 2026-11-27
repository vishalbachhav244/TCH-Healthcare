import { shiftDay, specialties } from '../domain/operations';
import type { Organisation } from '../domain/platform';
import type {
  Admission,
  Alert,
  Appointment,
  Bed,
  Encounter,
  Facility,
  Invoice,
  Patient,
  Payment,
  Practitioner,
  Ticket,
} from '../domain/operations';

export const facilities: Facility[] = [
  {
    id: 'mer-central',
    tenantId: 'meridian',
    name: 'Meridian Medical Centre',
    city: 'Bengaluru',
    inpatient: true,
    publicQueue: true,
    publicDiscovery: true,
    publicKiosk: true,
  },
  {
    id: 'mer-north',
    tenantId: 'meridian',
    name: 'Meridian North Hospital',
    city: 'Bengaluru',
    inpatient: true,
    publicQueue: true,
    publicDiscovery: true,
  },
  {
    id: 'city-main',
    tenantId: 'citycare',
    name: 'CityCare Hospital',
    city: 'Pune',
    inpatient: true,
  },
  {
    id: 'horizon',
    tenantId: 'horizon',
    name: 'Horizon Polyclinic',
    city: 'Hyderabad',
    inpatient: false,
  },
  {
    id: 'sunrise',
    tenantId: 'sunrise',
    name: 'Sunrise Clinic',
    city: 'Chennai',
    inpatient: false,
    publicDiscovery: true,
  },
  {
    id: 'lakeside',
    tenantId: 'lakeside',
    name: 'Lakeside Hospital',
    city: 'Kochi',
    inpatient: true,
  },
];

export const organisations: Organisation[] = [
  { id: 'meridian', name: 'Meridian Healthcare Network', plan: 'Network' },
  { id: 'citycare', name: 'CityCare Hospital', plan: 'Hospital' },
  { id: 'horizon', name: 'Horizon Polyclinic', plan: 'Clinic' },
  { id: 'sunrise', name: 'Sunrise Clinic', plan: 'Clinic' },
  { id: 'lakeside', name: 'Lakeside Hospital', plan: 'Hospital' },
];

const firstNames = [
  'Ananya',
  'Rajesh',
  'Priya',
  'Karan',
  'Meera',
  'Vikram',
  'Ishita',
  'Aarav',
  'Nisha',
  'Rahul',
  'Diya',
  'Suman',
  'Kabir',
  'Neha',
  'Ishan',
  'Riya',
  'Nakul',
  'Anika',
  'Arjun',
  'Maya',
];
const surnames = [
  'Sharma',
  'Menon',
  'Reddy',
  'Patel',
  'Iyer',
  'Rao',
  'Sethi',
  'Kapur',
  'Verma',
  'Nair',
  'Shah',
  'Joshi',
  'Dutta',
  'Bose',
  'Gill',
  'Das',
  'Malik',
  'Khan',
  'Singh',
  'Kulkarni',
  'Bhat',
  'Parikh',
  'Sinha',
];
const doctors = [
  'Nandita Rao',
  'Arvind Menon',
  'Kavya Iyer',
  'Sameer Shah',
  'Mitali Bose',
  'Neel Kapoor',
  'Aditi Nair',
  'Rohan Patel',
  'Tara Sethi',
  'Sanjay Rao',
  'Veena Datta',
  'Abhinav Reddy',
  'Divya Bhat',
  'Vijay Singh',
  'Sonia Nair',
  'Gaurav Iyer',
  'Sarika Gill',
  'Siddharth Das',
  'Indu Sharma',
  'Nikhil Joshi',
];

export function createPatient(tenantId: string, index: number): Patient {
  const first = firstNames[index % firstNames.length];
  const last = surnames[(Math.floor(index / firstNames.length) + index * 3) % surnames.length];
  return {
    id: `TC-${tenantId.toUpperCase()}-${String(index + 1001).padStart(5, '0')}`,
    tenantId,
    name: `${first} ${last}`,
    initials: first[0] + last[0],
    age: 18 + ((index * 17) % 67),
  };
}

export function seed(day: string, small = false) {
  const patients: Patient[] = [];
  const practitioners: Practitioner[] = [];
  const appointments: Appointment[] = [];
  const tickets: Ticket[] = [];
  const encounters: Encounter[] = [];
  const beds: Bed[] = [];
  const admissions: Admission[] = [];
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  const alerts: Alert[] = [];
  const daily = [122, 146, 122, 173, 154, 191, 166, 142, 154, 163, 131, 137, 152, 147];
  const wards = ['General ward', 'Surgical ward', 'Paediatric ward', 'Critical care'];
  for (const [fi, facility] of facilities.entries()) {
    const people = Array.from({ length: small ? 24 : 500 }, (_, i) =>
      createPatient(facility.tenantId, i),
    );
    if (fi !== 1) patients.push(...people);
    const team = doctors.map((name, i) => ({
      id: `${facility.id}-DR-${i + 1}`,
      facilityId: facility.id,
      name: 'Dr. ' + name,
      specialty: specialties[i % specialties.length],
    }));
    practitioners.push(...team);
    for (const [offset, volume] of daily.entries()) {
      const on = shiftDay(day, -offset);
      const count = small ? 12 : Math.round(volume * (fi === 0 ? 1 : 0.75 - fi * 0.04));
      for (let i = 0; i < count; i++) {
        const id = `${facility.id}-A-${offset}-${i + 1}`;
        const person = people[(i + offset * 37 + (fi === 1 ? 240 : 0)) % people.length];
        const provider = team[i % team.length];
        const slot = Math.floor(i / team.length);
        const time = `${String(9 + Math.floor(slot / 4)).padStart(2, '0')}:${String((slot % 4) * 15).padStart(2, '0')}`;
        const status: Appointment['status'] =
          offset > 0
            ? i % 17 === 0
              ? 'Cancelled'
              : 'Completed'
            : i < 5
              ? 'Booked'
              : i < 9
                ? 'Checked in'
                : i < 11
                  ? 'In consultation'
                  : i % 13 === 0
                    ? 'Cancelled'
                    : 'Completed';
        const timestamp = Date.parse(on + 'T' + time + ':00+05:30');
        appointments.push({
          id,
          facilityId: facility.id,
          patientId: person.id,
          practitionerId: provider.id,
          day: on,
          time,
          channel: (i * 11 + offset * 7) % 19 < 6 ? 'Walk-in' : 'Scheduled',
          status,
        });
        if (status === 'Booked' || status === 'Cancelled') continue;
        const arrivedAt = timestamp - (((i * 7) % 28) + 4) * 60_000;
        const calledAt = status === 'Checked in' && i !== 5 ? undefined : timestamp;
        tickets.push({
          id: id + '-Q',
          facilityId: facility.id,
          appointmentId: id,
          number: i + 1,
          arrivedAt,
          calledAt,
          status: status === 'Checked in' ? (calledAt ? 'Called' : 'Waiting') : status,
        });
        if (!calledAt || status === 'Checked in') continue;
        const encounterId = id + '-E';
        encounters.push({
          id: encounterId,
          facilityId: facility.id,
          appointmentId: id,
          patientId: person.id,
          practitionerId: provider.id,
          startedAt: calledAt,
          signedAt: status === 'Completed' ? calledAt + 600_000 : undefined,
          observation:
            status === 'Completed' ? 'History reviewed and findings documented.' : undefined,
        });
        if (status !== 'Completed') continue;
        const amountMinor = (550 + 175 * (i % 7)) * 100;
        const invoiceId = id + '-I';
        invoices.push({
          id: invoiceId,
          facilityId: facility.id,
          patientId: person.id,
          encounterId,
          day: on,
          lines: [{ description: 'Outpatient consultation', unitMinor: amountMinor, quantity: 1 }],
        });
        if (i % 7 !== 0) payments.push({ id: id + '-P', invoiceId, day: on, amountMinor });
      }
    }
    if (facility.inpatient) {
      for (let i = 0; i < (small ? 16 : fi === 0 ? 120 : 75); i++) {
        const wardIndex = i % wards.length;
        const bed: Bed = {
          id: facility.id + '-B-' + i,
          facilityId: facility.id,
          label: `${String.fromCharCode(65 + wardIndex)}-${String(1 + Math.floor(i / wards.length)).padStart(2, '0')}`,
          ward: wards[wardIndex],
          status:
            i % 17 === 0
              ? 'Maintenance'
              : i % 11 === 0
                ? 'Cleaning'
                : i % 5 === 0
                  ? 'Available'
                  : 'Occupied',
        };
        beds.push(bed);
        if (bed.status === 'Occupied') {
          const started = Date.parse(shiftDay(day, -(i % 6)) + 'T08:00:00+05:30');
          admissions.push({
            id: `${facility.id}-ADM-${i}`,
            facilityId: facility.id,
            bedId: bed.id,
            patientId: people[(i + 10) % people.length].id,
            status: 'Admitted',
            version: 1,
            requestedAt: started - 120_000,
            admittedAt: started,
          });
        }
      }
    }
    alerts.push(
      {
        id: facility.id + '-a1',
        facilityId: facility.id,
        title: facility.inpatient
          ? 'Critical care capacity review'
          : 'Evening appointment capacity',
        detail: facility.inpatient
          ? 'Review beds available for allocation.'
          : 'Review remaining consultation slots.',
        severity: 'Priority',
        time: '09:05',
        acknowledged: false,
      },
      {
        id: facility.id + '-a2',
        facilityId: facility.id,
        title: 'Queue review requested',
        detail: 'General Medicine · Reception',
        severity: 'Attention',
        time: '09:20',
        acknowledged: false,
      },
      {
        id: facility.id + '-a3',
        facilityId: facility.id,
        title: 'Payment reconciliation due',
        detail: 'Front desk collections · Finance',
        severity: 'Information',
        time: '09:40',
        acknowledged: false,
      },
    );
  }
  return {
    patients,
    practitioners,
    appointments,
    tickets,
    encounters,
    beds,
    admissions,
    invoices,
    payments,
    alerts,
  };
}
