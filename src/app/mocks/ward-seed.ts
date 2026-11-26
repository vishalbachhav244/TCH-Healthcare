import type { Admission } from '../domain/operations';
import type { WardAssignment } from '../domain/ward-care';

export function initialWardAssignments(admissions: readonly Admission[]): WardAssignment[] {
  return ['mer-central', 'mer-north'].flatMap((facilityId) => {
    const fixtures = admissions.filter(
      (row) =>
        row.facilityId === facilityId &&
        row.status === 'Admitted' &&
        row.id.startsWith(facilityId + '-ADM-'),
    );
    return fixtures.slice(0, 8).map((row, index) => ({
      admissionId: row.id,
      facilityId,
      version: 1,
      physician: facilityId === 'mer-central' && index === 7 ? 'wardcover' : 'wardphysician',
      nurse: facilityId === 'mer-central' && index === 7 ? 'wardrelief' : 'wardnurse',
    }));
  });
}
