import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { dayInIndia, shiftDay } from '../src/app/domain/operations';

async function signIn(page: Page, account: string) {
  await page.goto('/');
  await page.getByLabel('Account ID').fill(account);
  await page.getByLabel('Password', { exact: true }).fill('TrueCare-Local-2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/work\//, { timeout: 20_000 });
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in/);
}

async function checkReflow(page: Page) {
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      `${width}px viewport`,
    ).toBeLessThanOrEqual(width);
  }
}

test('hands an admitted patient from physician rounds to nursing evidence and discharge', async ({
  page,
}, testInfo) => {
  test.setTimeout(160_000);
  const patientId = 'TC-MERIDIAN-01001';
  await signIn(page, 'admissions');
  await page.getByRole('button', { name: 'Request admission' }).click();
  const request = page.getByRole('dialog', { name: 'Request admission' });
  await request.getByLabel('Find patient').fill(patientId);
  await request.getByLabel('Patient', { exact: true }).selectOption(patientId);
  await request.getByRole('button', { name: 'Request admission' }).click();
  await page.getByLabel('Find admission').fill(patientId);
  const admitted = page.getByRole('row', { name: new RegExp(patientId) });
  await admitted.getByRole('button', { name: 'Allocate bed' }).click();
  const allocate = page.getByRole('dialog', { name: 'Assign bed' });
  await allocate.getByLabel('Available bed').selectOption({ index: 1 });
  await allocate.getByRole('button', { name: 'Confirm bed allocation' }).click();
  await expect(admitted).toContainText('Admitted');

  const physician = await page.context().newPage();
  await signIn(physician, 'wardphysician');
  const nurse = await page.context().newPage();
  await signIn(nurse, 'wardnurse');
  await expect(physician.getByRole('heading', { name: 'Inpatient Physician' })).toBeVisible();
  await expect(nurse.getByRole('heading', { name: 'Nursing Station' })).toBeVisible();
  await physician.getByRole('searchbox', { name: 'Find assigned patient' }).fill(patientId);
  await nurse.getByRole('searchbox', { name: 'Find assigned patient' }).fill(patientId);
  const physicianRow = physician.getByRole('row', { name: new RegExp(patientId) });
  const nurseRow = nurse.getByRole('row', { name: new RegExp(patientId) });
  await expect(physicianRow).toHaveCount(0);
  await expect(nurseRow).toHaveCount(0);
  await admitted.getByRole('button', { name: 'Assign care team' }).click();
  const team = page.getByRole('dialog', { name: 'Assign care team' });
  await team.getByLabel('Inpatient physician').selectOption('wardphysician');
  await team.getByLabel('Ward nurse').selectOption('wardnurse');
  await team.getByRole('button', { name: 'Save care team' }).click();
  await expect(page.getByText('Care team assigned.')).toBeVisible();
  await physicianRow.getByRole('link', { name: 'Open care plan' }).click();
  await nurseRow.getByRole('link', { name: 'Open care plan' }).click();

  await physician.getByRole('button', { name: 'Record round' }).click();
  const round = physician.getByRole('dialog', { name: 'Record physician round' });
  await round.getByLabel('Round focus').selectOption('Post-admission review');
  await round.getByLabel('Round summary').selectOption('Reviewed with the ward team');
  await round.getByRole('button', { name: 'Save round' }).click();
  await expect(nurse.getByRole('region', { name: 'Physician rounds' })).toContainText(
    'Post-admission review',
  );

  const place = physician.getByRole('button', { name: 'Place ward order' });
  await place.focus();
  await physician.keyboard.press('Enter');
  const order = physician.getByRole('dialog', { name: 'Place ward order' });
  await expect(order).toBeVisible();
  await physician.keyboard.press('Escape');
  await expect(place).toBeFocused();
  async function orderTask(kind: string) {
    await place.click();
    await order.getByLabel('Order type').selectOption(kind);
    await order.getByRole('button', { name: 'Place order' }).click();
    await expect(order).toBeHidden();
  }
  await orderTask('Record ward observations');
  await orderTask('Document shift handover');
  const openTask = nurse.getByRole('row', { name: /Record ward observations/ });
  const cancelled = physician.getByRole('row', { name: /Document shift handover/ });
  await cancelled.getByRole('button', { name: 'Cancel order' }).click();
  await physician
    .getByRole('dialog', { name: 'Cancel ward order' })
    .getByRole('button', { name: 'Confirm cancellation' })
    .click();
  await expect(nurse.getByRole('row', { name: /Document shift handover/ })).toContainText(
    'Cancelled',
  );

  await admitted.getByRole('button', { name: 'Discharge', exact: true }).click();
  const discharge = page.getByRole('dialog', { name: 'Discharge patient' });
  await discharge.getByRole('button', { name: 'Confirm discharge' }).click();
  await expect(discharge.getByRole('alert')).toContainText('Complete or cancel open nursing tasks');
  await discharge.getByRole('button', { name: 'Close', exact: true }).click();
  await nurse.setViewportSize({ width: 390, height: 844 });
  const start = openTask.getByRole('button', { name: 'Start task' });
  await start.scrollIntoViewIfNeeded();
  await expect(start).toBeInViewport({ ratio: 1 });
  await start.click();
  const tracked = physician.getByRole('row', { name: /Record ward observations/ });
  await expect(tracked).toContainText('In progress');
  await openTask.getByRole('button', { name: 'Complete task' }).click();
  const completion = nurse.getByRole('dialog', { name: 'Complete nursing task' });
  await completion.getByLabel('Observation status').selectOption('Physician review requested');
  await completion.getByRole('button', { name: 'Complete task' }).click();
  await expect(tracked).toContainText('Completed');
  await expect(physician.getByRole('region', { name: 'Nursing observations' })).toContainText(
    'Physician review requested',
  );
  await nurse.getByRole('button', { name: 'Record observation' }).click();
  const standalone = nurse.getByRole('dialog', { name: 'Record nursing observation' });
  await standalone.getByLabel('Observation type').selectOption('Comfort check');
  await standalone.getByLabel('Observation status').selectOption('Recorded');
  await standalone.getByRole('button', { name: 'Save observation' }).click();
  await expect(nurse.getByText('Nursing observation recorded.', { exact: true })).toBeVisible();
  await nurse.reload();
  await expect(nurse.getByRole('region', { name: 'Nursing observations' })).toContainText(
    'Comfort check',
  );
  await expect(openTask).toContainText('Completed');
  await nurse.getByLabel('Task status').selectOption({ label: 'Completed' });
  await expect(nurse.getByRole('row', { name: /Document shift handover/ })).toHaveCount(0);
  await nurse.getByLabel('Task status').selectOption('');
  await checkReflow(physician);
  await checkReflow(nurse);
  await nurse.setViewportSize({ width: 390, height: 844 });
  for (const [workspace, name] of [
    [physician, 'inpatient-physician-1440'],
    [nurse, 'nursing-station-390'],
  ] as const) {
    expect(
      (
        await new AxeBuilder({ page: workspace })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await workspace.screenshot({
      path: testInfo.outputPath(name + '.png'),
      animations: 'disabled',
      fullPage: true,
    });
  }

  await admitted.getByRole('button', { name: 'Discharge', exact: true }).click();
  await discharge.getByRole('button', { name: 'Confirm discharge' }).click();
  await expect(admitted).toContainText('Discharged');
  await expect(physician.getByRole('alert')).toContainText('This admission is no longer active');
  await expect(nurse.getByRole('alert')).toContainText('This admission is no longer active');
  await page.goto('/work/inpatient-physician');
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await physician.close();
  await nurse.close();
});

test('uses prior care in booking and hands a signed follow-up to the patient and reception', async ({
  page,
}, testInfo) => {
  test.setTimeout(160_000);
  const patientId = 'TC-MERIDIAN-01001';
  const startsOn = shiftDay(dayInIndia(), 1);
  const endsOn = shiftDay(dayInIndia(), 3);
  const patient = await page.context().newPage();
  await signIn(patient, 'patient');
  await patient.getByRole('button', { name: 'Appointment pass', exact: true }).click();
  const pass = patient.getByRole('dialog', { name: 'Appointment pass' });
  const code = await pass.locator('code').innerText();
  await pass.getByRole('button', { name: 'Close', exact: true }).click();

  await signIn(page, 'reception');
  const selectPatient = async () => {
    await page.getByRole('button', { name: 'New appointment' }).click();
    const dialog = page.getByRole('dialog', { name: 'New appointment' });
    await dialog.getByLabel('Find patient').fill(patientId);
    await dialog.getByLabel('Patient', { exact: true }).selectOption(patientId);
    return dialog;
  };
  const standard = await selectPatient();
  await standard.getByRole('button', { name: 'Use previous clinician' }).click();
  await expect(standard.getByLabel('Clinician', { exact: true })).toHaveValue(/^mer-central-DR-/);
  await expect(standard.getByText('History reviewed and findings documented.')).toHaveCount(0);
  await standard.getByRole('button', { name: 'Close', exact: true }).click();

  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('link', { name: 'Consultation queue' })
    .click();
  await page.getByRole('button', { name: 'Verify arrival' }).click();
  const check = page.getByRole('dialog', { name: 'Verify arrival' });
  await check.getByLabel('Appointment pass code').fill(code);
  await check.getByRole('button', { name: 'Check in patient' }).click();
  await page.getByRole('searchbox', { name: 'Search appointments' }).fill(patientId);
  await page
    .getByRole('row', { name: new RegExp(patientId) })
    .getByRole('button', { name: 'Call token' })
    .click();

  const clinician = await page.context().newPage();
  await signIn(clinician, 'clinician');
  await clinician.getByRole('searchbox', { name: 'Search appointments' }).fill(patientId);
  const clinicalRow = clinician.getByRole('row', { name: new RegExp(patientId) });
  await clinicalRow.getByRole('button', { name: 'Start consultation' }).click();
  await clinicalRow.getByRole('button', { name: 'Review consultation' }).click();
  const visit = clinician.getByRole('dialog', { name: 'Consultation' });
  await expect(visit.getByRole('button', { name: 'Request follow-up' })).toHaveCount(0);
  await visit.getByText('Previous consultations', { exact: true }).click();
  const specialty = visit.getByLabel('Specialty', { exact: true });
  await expect(specialty).toBeVisible();
  const selectedSpecialty = await specialty.locator('option').nth(1).getAttribute('value');
  await specialty.selectOption(selectedSpecialty!);
  for (const row of await visit.locator('.continuity-history li').all())
    await expect(row).toContainText(selectedSpecialty!);
  await visit
    .getByLabel('Consultation observation')
    .selectOption('Observation completed. Follow-up discussed.');
  await visit.getByRole('button', { name: 'Sign and complete' }).click();
  await clinicalRow.getByRole('button', { name: 'View note' }).click();
  await visit.getByRole('button', { name: 'Request follow-up' }).click();
  await visit.getByLabel('Purpose', { exact: true }).selectOption('Review care plan');
  await visit.getByLabel('Earliest date').fill(startsOn);
  await visit.getByLabel('Latest date').fill(endsOn);
  await visit.getByRole('button', { name: 'Send follow-up request' }).click();
  await expect(visit.getByText('To book', { exact: true })).toBeVisible();
  await visit.getByText('Previous consultations', { exact: true }).click();
  await visit.getByLabel('Specialty', { exact: true }).selectOption(selectedSpecialty!);
  await checkReflow(clinician);
  expect(
    (
      await new AxeBuilder({ page: clinician })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await clinician.screenshot({
    path: testInfo.outputPath('consultation-continuity-desktop.png'),
    animations: 'disabled',
    fullPage: true,
  });

  const plan = patient.getByRole('region', { name: 'Follow-up requests' });
  await checkReflow(patient);
  await patient.setViewportSize({ width: 390, height: 844 });
  await plan.getByRole('button', { name: 'Book follow-up' }).click();
  const booking = patient.getByRole('dialog', { name: 'Book follow-up' });
  await expect(booking.getByLabel('Date', { exact: true })).toHaveValue(startsOn);
  await expect(booking.getByLabel('Date', { exact: true })).toHaveAttribute('max', endsOn);
  await booking.getByLabel('Time', { exact: true }).selectOption('14:00', { timeout: 12_000 });
  await booking.getByRole('button', { name: 'Book appointment' }).click();
  await expect(pass.locator('code')).toHaveText(/^[\da-f-]{36}$/);
  await pass.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(plan.getByText('Booked', { exact: true })).toBeVisible();
  await expect(visit.getByText('Booked', { exact: true })).toBeVisible();

  await page.goto('/work/appointments?day=' + startsOn);
  const scheduled = page.getByRole('row', { name: new RegExp(patientId) });
  await expect(scheduled).toContainText('Follow-up');
  await scheduled.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(plan.getByRole('button', { name: 'Book follow-up' })).toBeVisible();
  const followUpDesk = await selectPatient();
  await expect(followUpDesk.getByText('Review care plan', { exact: true })).toHaveCount(0);
  await followUpDesk.getByRole('button', { name: 'Book this follow-up' }).click();
  await followUpDesk.getByLabel('Time', { exact: true }).selectOption('14:15', { timeout: 12_000 });
  await followUpDesk.getByRole('button', { name: 'Book appointment' }).click();
  await expect(plan.getByText('14:15 IST', { exact: false })).toBeVisible();
  await patient.reload();
  await expect(plan.getByText('Booked', { exact: true })).toBeVisible();
  expect(
    (await new AxeBuilder({ page: patient }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await patient.screenshot({
    path: testInfo.outputPath('follow-up-390.png'),
    animations: 'disabled',
    fullPage: true,
  });
  await clinician.close();
  await patient.close();
});

test('shares clinician availability across waitlist, scheduling and patient booking', async ({
  page,
}, testInfo) => {
  test.setTimeout(125_000);
  const day = shiftDay(dayInIndia(), 1);
  const practitioner = 'mer-central-DR-1';
  await signIn(page, 'reception');
  await page.getByRole('main').getByRole('link', { name: 'Scheduling' }).click();
  await page.getByLabel('Schedule date').fill(day);
  await expect(page.getByText('No waitlist requests match this date and filter.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Block time' })).toHaveCount(0);
  const add = page.getByRole('button', { name: 'Add to waitlist' });
  await add.focus();
  await page.keyboard.press('Enter');
  const intake = page.getByRole('dialog', { name: 'Add to appointment waitlist' });
  await expect(intake).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(add).toBeFocused();
  await add.click();
  const patientId = 'TC-MERIDIAN-01001';
  await intake.getByLabel('Find patient').fill(patientId);
  await intake.getByLabel('Patient', { exact: true }).selectOption(patientId);
  await intake.getByLabel('Clinician', { exact: true }).selectOption(practitioner);
  await intake.getByRole('button', { name: 'Save waitlist request' }).click();
  const waiting = page
    .getByRole('region', { name: 'Appointment waitlist' })
    .getByRole('row', { name: new RegExp(patientId) });
  await expect(waiting.getByRole('button', { name: 'Book slot' })).toBeEnabled();
  await expect(page.getByLabel('Waitlist status')).toHaveValue('Waiting');
  await expect(page.getByRole('combobox', { name: 'Clinician', exact: true })).toHaveValue(
    practitioner,
  );

  const manager = await page.context().newPage();
  await signIn(manager, 'executive');
  await manager
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('link', { name: 'Scheduling', exact: true })
    .click();
  await manager.getByLabel('Schedule date').fill(day);
  await expect(manager.getByRole('button', { name: 'Add to waitlist' })).toHaveCount(0);
  const openBlock = async () => {
    await manager.getByRole('button', { name: 'Block time' }).click();
    const editor = manager.getByRole('dialog', { name: 'Block clinician time' });
    await editor.getByLabel('Clinician', { exact: true }).selectOption(practitioner);
    await editor.getByLabel('Starts at').selectOption('09:00');
    await editor.getByLabel('Ends at').selectOption('17:00');
    await editor.getByLabel('Reason', { exact: true }).selectOption('Clinician leave');
    await editor.getByRole('button', { name: 'Save schedule block' }).click();
    return editor;
  };
  await openBlock();
  await expect(manager.getByText('Clinician time blocked.')).toBeVisible();
  await expect(waiting).toContainText('No times available');
  await expect(page.getByRole('combobox', { name: 'Clinician', exact: true })).toHaveValue(
    practitioner,
  );
  await expect(waiting.getByRole('button', { name: 'Book slot' })).toBeDisabled();

  const patient = await page.context().newPage();
  await signIn(patient, 'patient');
  await patient.getByRole('button', { name: 'Book a visit' }).click();
  const booking = patient.getByRole('dialog', { name: 'Book a visit' });
  await booking.getByLabel('Find a clinician').selectOption(practitioner);
  await booking.getByLabel('Date', { exact: true }).fill(day);
  await expect(booking.getByText('No visits are available', { exact: false })).toBeVisible();
  await expect(booking.getByRole('button', { name: 'Book appointment' })).toBeDisabled();

  await checkReflow(page);
  await checkReflow(manager);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('scheduling-1440.png'),
    animations: 'disabled',
    fullPage: true,
  });
  await manager.getByRole('button', { name: 'Release block' }).click();
  await manager
    .getByRole('dialog', { name: 'Release schedule block' })
    .getByRole('button', { name: 'Confirm release' })
    .click();
  await expect(booking.locator('option[value="09:00"]')).toHaveCount(1);
  await waiting.getByRole('button', { name: 'Book slot' }).click();
  const conversion = page.getByRole('dialog', { name: 'Book from waitlist' });
  await conversion.getByLabel('Available time').selectOption('09:00');
  await conversion.getByRole('button', { name: 'Book appointment' }).click();
  await expect(waiting).toContainText('Booked');
  await expect(booking.locator('option[value="09:00"]')).toHaveCount(0);
  await booking.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(patient.getByText('09:00 IST', { exact: false })).not.toHaveCount(0);

  const conflict = await openBlock();
  await expect(conflict.getByRole('alert')).toContainText(
    'This range contains an existing appointment.',
  );
  await conflict.getByRole('button', { name: 'Close block editor' }).click();
  await expect(
    manager
      .getByRole('region', { name: 'Clinician schedule blocks' })
      .getByRole('row', { name: /Clinician leave/ }),
  ).toContainText('Released');
  await page.reload();
  await page.getByLabel('Schedule date').fill(day);
  await expect(waiting).toContainText('Booked');
  await page.getByRole('link', { name: 'View appointments' }).click();
  const scheduled = page.getByRole('row', { name: new RegExp(patientId) });
  await expect(scheduled).toContainText('09:00');
  await expect(scheduled).toContainText('Booked');
  await patient.goto('/work/scheduling');
  await expect(patient.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await manager.close();
  await patient.close();
});

test('matches a record request, grants one report, and withdraws access live', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await signIn(page, 'patient');
  await page.getByRole('button', { name: 'Record sharing' }).click();
  await page.getByLabel('Recipient', { exact: true }).selectOption('mer-referral-records');
  await page.getByRole('button', { name: 'Generate matching code' }).click();
  const code = await page.getByTestId('issued-matching-code').innerText();
  expect(code).toMatch(/^[\da-f-]{36}$/);

  const recipient = await page.context().newPage();
  await signIn(recipient, 'partnercare');
  await recipient.getByRole('button', { name: 'Request report', exact: true }).click();
  const editor = recipient.getByRole('dialog', { name: 'Request report' });
  await editor.getByLabel('Patient-issued matching code').fill(code);
  await editor.getByRole('button', { name: 'Send request' }).click();
  await expect(recipient.getByText('Request sent for patient review.')).toBeVisible();
  await expect(recipient.getByRole('button', { name: 'View shared report' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Review request' }).click();
  const consent = page.getByRole('dialog', { name: 'Review record request' });
  const report = consent.getByLabel('Report to share');
  const option = report.locator('option', { hasText: 'LAB-SHARE-0147' });
  await expect(option).toHaveCount(1);
  await report.selectOption({ label: 'Complete blood count · LAB-SHARE-0147' });
  await consent.getByRole('button', { name: 'Grant report access' }).click();
  await expect(page.getByText('Report access granted.')).toBeVisible();
  await recipient.getByRole('button', { name: 'View shared report' }).click();
  const shared = recipient.getByRole('dialog', { name: 'Shared report' });
  await expect(shared.getByText('LAB-SHARE-0147')).toBeVisible();

  const admin = await page.context().newPage();
  await signIn(admin, 'integration');
  const connectors = admin.getByRole('region', { name: 'Connector directory' });
  const referral = connectors.getByRole('row', { name: /Referral records/ });
  await referral.getByRole('button', { name: 'Pause connector' }).click();
  await expect(
    shared.getByText('This report is no longer available to this recipient.'),
  ).toBeVisible();
  await shared.getByRole('button', { name: 'Close' }).click();
  await expect(recipient.getByRole('row', { name: /Continuation of care/ })).toContainText(
    'Unavailable',
  );
  await referral.getByRole('button', { name: 'Enable connector' }).click();
  await recipient.getByRole('button', { name: 'View shared report' }).click();
  await expect(shared.getByText('LAB-SHARE-0147')).toBeVisible();

  await page.getByRole('button', { name: 'Revoke access', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm revocation' }).click();
  await expect(
    shared.getByText('This report is no longer available to this recipient.'),
  ).toBeVisible();
  await shared.getByRole('button', { name: 'Close' }).click();
  await expect(recipient.getByRole('row', { name: /Continuation of care/ })).toContainText(
    'Revoked',
  );
  const audit = admin.getByRole('region', { name: 'Exchange audit' });
  await expect(audit.getByRole('row', { name: /Referral records.*Released/ })).toHaveCount(2);
  await expect(audit.getByText('LAB-SHARE-0147')).toHaveCount(0);
  for (const workspace of [admin, recipient, page]) await checkReflow(workspace);
  expect(
    (await new AxeBuilder({ page: admin }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await admin.screenshot({
    path: testInfo.outputPath('integrations-desktop.png'),
    animations: 'disabled',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole('button', { name: 'Record sharing' }).click();
  await expect(page.getByText('Revoked', { exact: true })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('record-sharing-390.png'),
    animations: 'disabled',
    fullPage: true,
  });
  await recipient.close();
  await admin.close();
});

test('refers a diagnostic result and resolves the quality case across roles', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await signIn(page, 'medicaldirector');
  const reports = page.getByRole('region', { name: 'Flagged diagnostic reports' });
  const first = reports
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: 'Review result' }) })
    .first();
  const accession = await first.locator('small').innerText();
  await first.getByRole('button', { name: 'Review result' }).focus();
  await page.keyboard.press('Enter');
  const review = page.getByRole('dialog', { name: 'Review diagnostic report' });
  await expect(review.getByText(accession, { exact: false })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(first.getByRole('button', { name: 'Review result' })).toBeFocused();
  await first.getByRole('button', { name: 'Review result' }).click();
  await review.getByRole('button', { name: 'Refer to quality' }).click();
  await expect(page.getByText('Referred to Quality & Compliance.')).toBeVisible();
  const referred = reports.getByRole('row').filter({ hasText: accession });
  await expect(referred).toContainText('Open');

  const coordinator = await page.context().newPage();
  await signIn(coordinator, 'quality');
  const referredCase = coordinator.getByRole('row', { name: /Review diagnostic follow-up/ });
  await expect(referredCase).not.toContainText(accession);
  await referredCase.getByRole('button', { name: 'View case' }).click();
  const details = coordinator.getByRole('dialog', { name: 'Quality case details' });
  await details.getByRole('button', { name: 'Take ownership' }).click();
  await expect(referred).toContainText('Investigating');
  await referredCase.getByRole('button', { name: 'View case' }).click();
  await expect(details.getByRole('button', { name: 'Resolve case' })).toBeDisabled();
  await details.getByLabel('Resolution').selectOption('Follow-up scheduled');
  await details.getByRole('button', { name: 'Resolve case' }).click();
  await expect(referred).toContainText('Resolved');
  await coordinator.reload();
  await referredCase.getByRole('button', { name: 'View case' }).click();
  await expect(details.getByText('Follow-up scheduled')).toBeVisible();
  await details.getByRole('button', { name: 'Close case details' }).click();

  await coordinator.getByRole('button', { name: 'Open quality case' }).click();
  const editor = coordinator.getByRole('dialog', { name: 'Open quality case' });
  await editor.getByLabel('Case title').fill('Review shift handover checklist');
  await editor.getByLabel('Category').selectOption('Service process');
  await editor.getByRole('button', { name: 'Create case' }).click();
  await expect(
    coordinator.getByRole('row', { name: /Review shift handover checklist/ }),
  ).toContainText('Open');
  await coordinator.getByLabel('Case status').selectOption('Resolved');
  await expect(
    coordinator.getByRole('row', { name: /Review shift handover checklist/ }),
  ).toHaveCount(0);
  await coordinator.getByLabel('Case status').selectOption('');

  for (const [workspace, file] of [
    [page, 'clinical-governance'],
    [coordinator, 'quality-register'],
  ] as const) {
    await checkReflow(workspace);
    expect(
      (
        await new AxeBuilder({ page: workspace })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await workspace.screenshot({
      path: testInfo.outputPath(file + '-desktop.png'),
      animations: 'disabled',
      fullPage: true,
    });
  }
  await page.goto('/work/quality');
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await page.getByRole('link', { name: 'Return to workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Clinical governance' })).toBeVisible();
  await coordinator.close();
});

test('platform provisions organizations and revokes active inpatient workspaces', async ({
  page,
}, testInfo) => {
  test.setTimeout(100_000);
  const staff = await page.context().newPage();
  await signIn(page, 'platform');
  await page.getByRole('button', { name: 'Create organization' }).click();
  const organization = page.getByRole('dialog', { name: 'Create organization' });
  await organization.getByLabel('Organization name').fill('Cove Healthcare');
  await organization.getByLabel('Subscription plan').selectOption('Hospital');
  await organization.getByRole('button', { name: 'Create organization' }).click();
  await expect(page.getByRole('heading', { name: 'Cove Healthcare' })).toBeVisible();
  await page.getByRole('button', { name: 'Add facility' }).click();
  const location = page.getByRole('dialog', { name: 'Add facility' });
  await location.getByLabel('Facility name').fill('Cove North Hospital');
  await location.getByLabel('City').fill('Chennai');
  await location.getByRole('button', { name: 'Add facility' }).click();
  await expect(page.getByRole('row', { name: /Cove North Hospital.*Disabled/ })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Cove Healthcare/ }).click();
  await expect(page.getByRole('row', { name: /Cove North Hospital.*Disabled/ })).toBeVisible();
  await signIn(staff, 'executive');
  const cove = page.getByRole('row', { name: /Cove North Hospital/ });
  await cove.getByRole('button', { name: 'Staff access' }).click();
  const membership = page.getByRole('dialog', { name: 'Manage staff access' });
  await membership.getByLabel('Staff account').selectOption('executive');
  await membership.getByLabel('Facility role').selectOption('cashier');
  await membership.getByRole('button', { name: 'Save staff access' }).click();
  await expect(page.getByText('Staff access saved.', { exact: true })).toBeVisible();
  await expect(
    staff
      .getByLabel('Facility', { exact: true })
      .locator('option', { hasText: 'Cove North Hospital' }),
  ).toHaveCount(0);
  await cove.getByRole('button', { name: 'Edit status' }).click();
  const activation = page.getByRole('dialog', { name: 'Edit facility status' });
  await activation.getByLabel('Facility status').selectOption('true');
  await activation.getByRole('button', { name: 'Save status' }).click();
  await expect(page.getByText('Facility status updated.', { exact: true })).toBeVisible();
  await staff
    .getByLabel('Facility', { exact: true })
    .selectOption({ label: 'Cove North Hospital' });
  await expect(staff.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await staff.getByRole('link', { name: 'Return to workspace' }).click();
  await expect(staff.getByRole('heading', { name: 'Revenue Cycle' })).toBeVisible();
  await cove.getByRole('button', { name: 'Staff access' }).click();
  await membership.getByLabel('Staff account').selectOption('executive');
  await membership.getByRole('button', { name: 'Revoke access' }).click();
  await expect(staff.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await staff.getByRole('link', { name: 'Return to workspace' }).click();
  await staff.getByRole('link', { name: 'Bed management' }).click();
  await expect(staff.getByRole('heading', { name: 'Bed Management' })).toBeVisible();
  await page.getByRole('button', { name: /Meridian Healthcare Network/ }).click();
  await page.screenshot({
    path: testInfo.outputPath('platform-1440.png'),
    animations: 'disabled',
    fullPage: true,
  });
  const ward = await page.context().newPage();
  const nursing = await page.context().newPage();
  await signIn(ward, 'wardphysician');
  await signIn(nursing, 'wardnurse');
  await expect(ward.getByRole('heading', { name: 'Inpatient Physician' })).toBeVisible();
  await expect(nursing.getByRole('heading', { name: 'Nursing Station' })).toBeVisible();
  await page
    .getByRole('row', { name: /Meridian Medical Centre/ })
    .getByRole('button', { name: 'Edit entitlement' })
    .click();
  const editor = page.getByRole('dialog', { name: 'Edit inpatient entitlement' });
  await editor.getByLabel('Inpatient operations').selectOption('false');
  await editor.getByRole('button', { name: 'Save entitlement' }).click();
  await expect(page.getByText('Inpatient entitlement updated.', { exact: true })).toBeVisible();
  await expect(staff.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await expect(ward.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await expect(nursing.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await ward.close();
  await nursing.close();
  await staff.close();
});

test('overview renders, filters, persists alert acknowledgement and exports through the UI', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome to TrueCare' })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('sign-in-1440.png'), animations: 'disabled' });
  await signIn(page, 'executive');
  await expect(page.getByRole('heading', { name: 'Hospital Overview' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Patient flow' })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('overview-1440.png'),
    animations: 'disabled',
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByLabel('Trend period').selectOption('14');
  await page.getByText('View trend data').click();
  await expect(
    page.getByRole('table', { name: 'Patient flow per day' }).getByRole('row'),
  ).toHaveCount(15);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export summary' }).click();
  expect((await download).suggestedFilename()).toMatch(/^truecare-patient-flow-/);
  await page.getByRole('button', { name: /Critical care capacity review/ }).click();
  await page.getByRole('button', { name: 'Acknowledge', exact: true }).click();
  await expect(page.getByText('2 open')).toBeVisible();
  await page.reload();
  await expect(page.getByText('2 open')).toBeVisible();
  await page.getByLabel('Facility', { exact: true }).selectOption('mer-north');
  await expect(page.getByText('3 open')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hospital Overview' })).toBeVisible();
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.screenshot({
    path: testInfo.outputPath('overview-390.png'),
    animations: 'disabled',
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'Close navigation' }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
  await page.getByRole('button', { name: 'Open navigation' }).press('Enter');
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('link', { name: 'Bed management' })
    .click();
  await expect(page.getByRole('heading', { name: 'Bed Management' })).toBeVisible();
});

test('clinic omits inpatient metrics and rejects a direct bed route', async ({ page }) => {
  await signIn(page, 'sunrise');
  await expect(page.getByRole('heading', { name: 'Patient flow' })).toBeVisible();
  await expect(page.getByText('Bed occupancy')).toHaveCount(0);
  await page.goto('/work/beds');
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
});

test('reviews a subscription and drills into assigned network branches', async ({
  page,
}, testInfo) => {
  await signIn(page, 'success');
  await expect(page.getByRole('heading', { name: 'Subscriptions' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Find organization' }).fill('Meridian');
  await expect(page.getByRole('row', { name: /CityCare/ })).toHaveCount(0);
  await page
    .getByRole('row', { name: /Meridian/ })
    .getByRole('button', { name: 'Manage subscription' })
    .click();
  const subscription = page.getByRole('dialog', { name: 'Manage subscription' });
  await subscription.getByLabel('Subscription plan').selectOption('Clinic');
  await subscription.getByRole('button', { name: 'Save plan' }).click();
  await expect(subscription.getByRole('alert')).toContainText('Disable inpatient operations');
  await subscription.getByRole('button', { name: 'Mark reviewed' }).click();
  await expect(page.getByText('Account review recorded.')).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('subscriptions-desktop.png'),
    animations: 'disabled',
  });
  await signOut(page);
  await signIn(page, 'network');
  await expect(page.getByRole('heading', { name: 'Network Performance' })).toBeVisible();
  await page
    .getByRole('row', { name: /Meridian North Hospital/ })
    .getByRole('button', { name: 'View departments' })
    .click();
  await expect(
    page.getByRole('heading', { name: /Departments · Meridian North Hospital/ }),
  ).toBeVisible();
  await expect(page.getByRole('row', { name: /Sunrise Clinic/ })).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('network-desktop.png'),
    animations: 'disabled',
  });
  await page.getByRole('link', { name: 'Open hospital overview' }).click();
  await expect(page.getByRole('heading', { name: 'Hospital Overview' })).toBeVisible();
  await expect(page.getByLabel('Facility', { exact: true })).toHaveValue('mer-north');
});

test('opens, investigates, resolves and reloads a platform incident', async ({
  page,
}, testInfo) => {
  await signIn(page, 'operations');
  await page.getByRole('button', { name: 'Open incident', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Open incident' });
  await editor.getByLabel('Incident title').fill('Review queue display updates');
  await editor.getByLabel('Affected service').selectOption('Queue display');
  await editor.getByLabel('Priority').selectOption('High');
  await editor.getByRole('button', { name: 'Create incident' }).click();
  const entry = page.getByRole('row', { name: /Review queue display updates/ });
  await entry.getByRole('button', { name: 'Start investigation' }).click();
  await entry.getByRole('button', { name: 'Resolve incident' }).click();
  await expect(page.getByText('Incident resolved.', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Include resolved' }).click();
  await expect(entry).toContainText('Resolved');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('platform-operations-desktop.png'),
    animations: 'disabled',
    fullPage: true,
  });
});

test('registers, books, checks in, completes a consultation, and settles an invoice', async ({
  page,
}) => {
  await signIn(page, 'reception');
  await page.getByRole('link', { name: 'Patients', exact: true }).click();
  await page.getByRole('button', { name: 'Register patient', exact: true }).click();
  const registration = page.getByRole('dialog', { name: 'Register patient' });
  await registration.getByLabel('Issued registration code').fill('REG-1001');
  await registration.getByRole('button', { name: 'Register patient' }).click();
  const id = 'TC-MERIDIAN-03002';
  await expect(page.getByText('Patient registered. ' + id)).toBeVisible();
  await page.getByRole('button', { name: 'Register patient', exact: true }).click();
  await registration.getByLabel('Issued registration code').fill('REG-1001');
  await registration.getByRole('button', { name: 'Register patient' }).click();
  await expect(registration.getByRole('alert')).toContainText('already assigned');
  await registration.getByRole('button', { name: 'Close' }).click();
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('link', { name: 'Appointments', exact: true })
    .click();
  await page.getByRole('button', { name: 'New appointment' }).click();
  const booking = page.getByRole('dialog', { name: 'New appointment' });
  await booking.getByLabel('Find patient').fill(id);
  await booking.getByLabel('Patient', { exact: true }).selectOption(id);
  await booking.getByLabel('Clinician').selectOption('mer-central-DR-1');
  await booking.getByRole('button', { name: 'Book appointment' }).click();
  const passDialog = page.getByRole('dialog', { name: 'Appointment pass' });
  const originalPass = await passDialog.locator('code').innerText();
  await passDialog.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('searchbox', { name: 'Search appointments' }).fill(id);
  await page
    .getByRole('row', { name: new RegExp(id) })
    .getByRole('button', { name: 'Reschedule' })
    .click();
  const reschedule = page.getByRole('dialog', { name: 'Reschedule appointment' });
  await reschedule.getByLabel('Time', { exact: true }).selectOption('14:15');
  await reschedule.getByRole('button', { name: 'Save appointment' }).click();
  const pass = await passDialog.locator('code').innerText();
  expect(pass).toMatch(/^[\da-f-]{36}$/i);
  expect(pass).not.toBe(originalPass);
  await expect(passDialog.getByRole('img')).toBeVisible();
  const qr = await passDialog.getByRole('img').getAttribute('src');
  await passDialog.getByRole('button', { name: 'Done' }).click();

  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('link', { name: 'Consultation queue' })
    .click();
  await page.getByRole('button', { name: 'Verify arrival' }).click();
  const check = page.getByRole('dialog', { name: 'Verify arrival' });
  await check.getByLabel('Scan a QR pass image').setInputFiles({
    name: 'appointment.png',
    mimeType: 'image/png',
    buffer: Buffer.from(qr!.split(',')[1], 'base64'),
  });
  await expect(check.getByLabel('Appointment pass code')).toHaveValue(pass);
  await check.getByRole('button', { name: 'Check in patient' }).click();
  await expect(check).not.toBeVisible();
  await page.getByRole('button', { name: 'Verify arrival' }).click();
  await check.getByLabel('Appointment pass code').fill(pass);
  await check.getByRole('button', { name: 'Check in patient' }).click();
  await expect(check.getByRole('alert')).toContainText('already been checked in');
  await check.getByRole('button', { name: 'Close' }).click();
  const display = await page.context().newPage();
  await display.goto('/display/mer-central');
  await expect(display.getByRole('heading', { name: 'Now calling' })).toBeVisible();
  const displayed = display.locator('.display-token');
  const prior = await displayed.count();
  await page.getByRole('searchbox', { name: 'Search appointments' }).fill(id);
  await page
    .getByRole('row', { name: new RegExp(id) })
    .getByRole('button', { name: 'Call token' })
    .click();
  await expect(page.getByRole('row', { name: new RegExp(id) })).toContainText('Called');
  await expect(displayed).toHaveCount(prior + 1);
  await expect(display.locator('main')).not.toContainText(id);
  await display.close();
  const token = page.getByRole('row', { name: new RegExp(id) });
  await token.getByRole('button', { name: 'Recall', exact: true }).click();
  await token.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(token).toContainText('Skipped');
  await token.getByRole('button', { name: 'Requeue', exact: true }).click();
  await expect(token).toContainText('Waiting');
  for (const destination of ['mer-central-DR-2', 'mer-central-DR-1']) {
    await token.getByRole('button', { name: 'Transfer', exact: true }).click();
    const transfer = page.getByRole('dialog', { name: 'Transfer token' });
    await transfer.getByLabel('Destination clinician').selectOption(destination);
    await transfer.getByRole('button', { name: 'Transfer token' }).click();
    await expect(transfer).not.toBeVisible();
  }
  await token.getByRole('button', { name: 'Call token' }).click();
  await expect(token).toContainText('Called');
  await signOut(page);

  await signIn(page, 'clinician');
  await page.getByRole('searchbox', { name: 'Search appointments' }).fill(id);
  await page.getByRole('button', { name: 'Start consultation' }).click();
  await page.getByRole('button', { name: 'Review consultation' }).click();
  const visit = page.getByRole('dialog', { name: 'Consultation' });
  await visit.getByLabel('Medication', { exact: true }).selectOption('saline');
  await visit.getByRole('button', { name: 'Save prescription draft' }).click();
  await visit.getByRole('button', { name: 'Sign prescription' }).click();
  await expect(visit.getByText('Prescription signed and sent to pharmacy.')).toBeVisible();
  await visit.getByLabel('Laboratory order').selectOption('Complete blood count');
  await visit.getByRole('button', { name: 'Order test' }).click();
  await expect(visit.getByText('Laboratory order created.')).toBeVisible();
  await visit.getByLabel('Consultation observation').selectOption({ index: 1 });
  await visit.getByRole('button', { name: 'Sign and complete' }).click();
  await expect(page.getByRole('row', { name: new RegExp(id) })).toContainText('Completed');
  await signOut(page);

  await signIn(page, 'cashier');
  await page.getByRole('button', { name: 'New invoice' }).click();
  const invoice = page.getByRole('dialog', { name: 'Issue invoice' });
  await expect(invoice.getByLabel('Signed encounter').locator('option').last()).toContainText(id);
  await invoice.getByLabel('Signed encounter').selectOption({ index: 1 });
  await invoice.getByLabel('Service').selectOption('Outpatient consultation');
  await invoice.getByRole('button', { name: 'Issue invoice' }).click();
  await page
    .getByRole('row', { name: new RegExp(id) })
    .getByRole('button', { name: 'Record settlement' })
    .click();
  await page.getByRole('button', { name: 'Confirm settlement' }).click();
  await expect(page.getByRole('row', { name: new RegExp(id) })).toContainText('Paid');
  await page.reload();
  await expect(page.getByRole('row', { name: new RegExp(id) })).toContainText('Paid');
});

test('dispenses from a current stock lot and posts the medication to billing', async ({
  page,
}, testInfo) => {
  await signIn(page, 'pharmacy');
  await expect(page.getByRole('heading', { name: 'Pharmacy' })).toBeVisible();
  const row = page.getByRole('row', { name: /Oral hydration sachets/ });
  await row.getByRole('button', { name: 'Dispense', exact: true }).click();
  const dispense = page.getByRole('dialog', { name: 'Dispense medication' });
  const lots = dispense.getByLabel('Eligible stock lot');
  await expect(lots.locator('option', { hasText: 'HC-1824' })).toHaveCount(0);
  await lots.selectOption('mer-central-hydration-1');
  await dispense.getByRole('button', { name: 'Confirm dispensing' }).click();
  await expect(page.getByText('Medication dispensed and charge posted.')).toBeVisible();
  await expect(row).toContainText('Dispensed');
  await page.getByRole('button', { name: 'Stock lots', exact: true }).click();
  await expect(page.getByRole('row', { name: /Oral hydration sachets.*HC-2320/ })).toContainText(
    '36',
  );
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('pharmacy-desktop.png'),
    animations: 'disabled',
  });
  await signOut(page);
  await signIn(page, 'cashier');
  await expect(page.getByRole('row', { name: /Oral hydration sachets/ })).toContainText(
    'Outstanding',
  );
});

test('moves a patient from admission request through cleaning and bed release', async ({
  page,
}) => {
  await signIn(page, 'admissions');
  await page.getByRole('button', { name: 'Request admission' }).click();
  const request = page.getByRole('dialog', { name: 'Request admission' });
  const id = 'TC-MERIDIAN-01199';
  await request.getByLabel('Find patient').fill(id);
  await request.getByLabel('Patient', { exact: true }).selectOption(id);
  await request.getByRole('button', { name: 'Request admission' }).click();
  await expect(page.getByText('Admission requested.')).toBeVisible();
  await page.getByLabel('Find admission').fill(id);
  const row = page.getByRole('row', { name: new RegExp(id) });
  await row.getByRole('button', { name: 'Allocate bed' }).click();
  const assign = page.getByRole('dialog', { name: 'Assign bed' });
  const bed = (await assign.getByLabel('Available bed').locator('option').nth(1).innerText()).split(
    ' · ',
  )[1];
  await assign.getByLabel('Available bed').selectOption({ index: 1 });
  await assign.getByRole('button', { name: 'Confirm bed allocation' }).click();
  await expect(row).toContainText('Admitted');
  await expect(row).toContainText(bed);
  await row.getByRole('button', { name: 'Discharge' }).click();
  await page.getByRole('button', { name: 'Confirm discharge' }).click();
  await expect(row).toContainText('Discharged');
  await page.getByRole('button', { name: 'Bed board' }).click();
  await page.getByLabel('Filter by bed status').selectOption('Cleaning');
  await page.getByRole('button', { name: 'Release bed ' + bed }).click();
  await expect(page.getByText('Bed available for allocation.')).toBeVisible();
});

test('laboratory stages render and the mobile patient sees only their own pass and care tabs', async ({
  page,
}, testInfo) => {
  await signIn(page, 'lab');
  await expect(page.getByRole('heading', { name: 'Laboratory Worklist' })).toBeVisible();
  await page.getByRole('button', { name: /^Ordered / }).click();
  await page.getByRole('button', { name: 'Collect specimen', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Collect specimen' }).click();
  await expect(page.getByText('Laboratory worklist updated.')).toBeVisible();
  await signOut(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'patient');
  await expect(page.getByRole('heading', { name: 'My care', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Appointment pass' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Appointment pass' }).getByRole('img'),
  ).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Reports' }).click();
  await expect(page.getByRole('heading', { name: 'Released laboratory reports' })).toBeVisible();
  await page.getByRole('button', { name: 'Appointments', exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath('patient-390.png'),
    animations: 'disabled',
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
