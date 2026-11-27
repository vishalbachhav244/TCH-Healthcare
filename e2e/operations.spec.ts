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

test('converts an assigned enquiry and simulates outreach with current permission', async ({
  page,
}, testInfo) => {
  test.setTimeout(160_000);
  await signIn(page, 'crm');
  const agent = await page.context().newPage();
  const engagement = await page.context().newPage();
  const patient = await page.context().newPage();
  await signIn(agent, 'crmagent');
  await signIn(engagement, 'marketing');
  await signIn(patient, 'patient');
  const id = 'TC-MERIDIAN-01001';
  const capture = page.getByRole('button', { name: 'Capture enquiry' });
  const editor = page.getByRole('dialog', { name: 'Capture enquiry' });
  await capture.focus();
  await page.keyboard.press('Enter');
  await expect(editor).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(capture).toBeFocused();
  await capture.click();
  await editor.getByLabel('Find registered patient').fill(id);
  await editor.getByLabel('Patient', { exact: true }).selectOption(id);
  await editor.getByLabel('Enquiry source').selectOption('Referral');
  await editor.getByLabel('Specialty').selectOption('General Medicine');
  await editor.getByRole('button', { name: 'Save enquiry' }).click();
  const enquiry = page.getByRole('row', { name: new RegExp(id) });
  const task = agent.getByRole('row', { name: new RegExp(id) });
  await expect(enquiry).toContainText('New');
  await expect(task).toHaveCount(0);
  await expect(agent.getByRole('button', { name: 'Capture enquiry' })).toHaveCount(0);
  await enquiry.getByRole('button', { name: 'Assign follow-up' }).click();
  await page.getByLabel('Contact agent').selectOption('crmagent');
  await page.getByRole('button', { name: 'Save assignment' }).click();
  await expect(task).toContainText('Assigned');
  async function record(outcome: string) {
    await task.getByRole('button', { name: 'Record contact' }).click();
    await agent.getByLabel('Contact outcome').selectOption(outcome);
    await agent.getByRole('button', { name: 'Save contact outcome' }).click();
  }
  await record('No answer');
  await expect(task).toContainText('No answer');
  await expect(task.getByRole('button', { name: 'Book appointment' })).toHaveCount(0);
  await record('Reached');
  await expect(task).toContainText('Contacted');
  await agent.reload();
  await expect(task).toContainText('Contacted');
  await task.getByRole('button', { name: 'Book appointment' }).click();
  const booking = agent.getByRole('dialog', { name: 'Book appointment' });
  await booking.getByLabel('Appointment date').fill(shiftDay(dayInIndia(), 1));
  await booking.getByLabel('Clinician', { exact: true }).selectOption({ index: 1 });
  const times = booking.getByLabel('Available time (IST)');
  await expect(times.locator('option').nth(1)).toBeAttached();
  await times.selectOption({ index: 1 });
  await booking.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(enquiry).toContainText('Booked');
  const referral = engagement.getByRole('row', { name: /Referral/ });
  await expect(referral).toContainText('100%');
  await expect(engagement.getByText(id)).toHaveCount(0);
  await checkReflow(page);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('crm-1440.png'), animations: 'disabled' });

  const create = engagement.getByRole('button', { name: 'Create campaign' });
  const draft = engagement.getByRole('dialog', { name: 'Create campaign' });
  await create.focus();
  await engagement.keyboard.press('Enter');
  await expect(draft).toBeVisible();
  await engagement.keyboard.press('Escape');
  await expect(create).toBeFocused();
  await create.click();
  await draft.getByLabel('Template').selectOption('Health education');
  await draft.getByLabel('Communication channel').selectOption('Email');
  await draft.getByRole('button', { name: 'Save draft' }).click();
  const campaign = engagement.getByRole('row', { name: /Health education/ });
  await expect(campaign).toContainText('Awaiting opt-ins');

  const preferences = patient.getByRole('button', { name: 'Contact preferences' });
  const allow = patient.getByRole('button', { name: 'Allow Email' });
  const revoke = patient.getByRole('button', { name: 'Turn off Email' });
  await preferences.click();
  await allow.click();
  await expect(campaign).toContainText('1 opted in');
  await campaign.getByRole('button', { name: 'Simulate campaign' }).click();
  const simulate = engagement.getByRole('dialog', { name: 'Simulate campaign' });
  await revoke.click();
  await expect(allow).toBeVisible();
  await simulate.getByRole('button', { name: 'Run simulation' }).click();
  await expect(simulate.getByRole('alert')).toHaveText('No patients currently allow this channel.');
  await engagement.keyboard.press('Escape');
  await expect(campaign).toContainText('Awaiting opt-ins');
  await allow.click();
  await campaign.getByRole('button', { name: 'Simulate campaign' }).click();
  await simulate.getByRole('button', { name: 'Run simulation' }).click();
  await expect(campaign).toContainText('1 simulated');
  await patient.reload();
  await preferences.click();
  await revoke.click();
  await expect(allow).toBeVisible();
  await engagement.reload();
  await engagement.getByRole('button', { name: 'Campaigns', exact: true }).click();
  await expect(campaign).toContainText('Simulated');
  await expect(campaign).toContainText('1 simulated');
  await checkReflow(engagement);
  await engagement.setViewportSize({ width: 390, height: 844 });
  expect(
    (
      await new AxeBuilder({ page: engagement })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await engagement.screenshot({
    path: testInfo.outputPath('marketing-390.png'),
    animations: 'disabled',
  });
  const admin = await page.context().newPage();
  await signIn(admin, 'platform');
  await admin.getByRole('button', { name: /Meridian Healthcare Network/ }).click();
  await admin
    .getByRole('row', { name: /Meridian Medical Centre/ })
    .getByRole('button', { name: 'Edit engagement' })
    .click();
  const entitlement = admin.getByRole('dialog', { name: 'Edit engagement entitlement' });
  await entitlement.getByLabel('CRM and marketing').selectOption('false');
  await entitlement.getByRole('button', { name: 'Save engagement' }).click();
  for (const workspace of [page, agent, engagement]) {
    await expect(workspace.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  }
  await expect(allow).toBeVisible();
  for (const workspace of [patient, agent, engagement, admin]) await workspace.close();
});

test('rosters staff and records attendance across reload', async ({ page }, testInfo) => {
  test.setTimeout(100_000);
  await signIn(page, 'workforce');
  await expect(page.getByRole('heading', { name: 'HR & Workforce' })).toBeVisible();
  await page.getByRole('button', { name: 'Staff directory', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find staff' }).fill('Neha Pillai');
  await expect(page.getByRole('row', { name: /Neha Pillai/ })).toBeVisible();
  await page.getByRole('button', { name: 'Shift roster', exact: true }).click();
  await expect(page.getByText('No shifts match this roster date and filters.')).toBeVisible();
  const schedule = page.getByRole('button', { name: 'Schedule shift' });
  const editor = page.getByRole('dialog', { name: 'Schedule shift' });
  await schedule.focus();
  await page.keyboard.press('Enter');
  await expect(editor).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(schedule).toBeFocused();
  await schedule.click();
  const selectStaff = () => editor.getByLabel('Staff member').selectOption('wardnurse:mer-central');
  await selectStaff();
  await editor.getByRole('button', { name: 'Save shift' }).click();
  const shift = page.getByRole('row', { name: /Neha Pillai/ });
  await expect(shift).toContainText('Scheduled');
  await schedule.click();
  await selectStaff();
  await editor.getByLabel('Starts at').selectOption('08:30');
  await editor.getByRole('button', { name: 'Save shift' }).click();
  await expect(editor.getByRole('alert')).toHaveText(
    'This staff member already has an overlapping shift.',
  );
  await page.keyboard.press('Escape');
  await shift.getByRole('button', { name: 'Check in' }).click();
  await page.getByRole('button', { name: 'Confirm check-in' }).click();
  await expect(shift).toContainText('Checked in');
  await page.reload();
  await expect(shift).toContainText('Checked in');
  await checkReflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('workforce-390.png'), animations: 'disabled' });
  await shift.getByRole('button', { name: 'Check out' }).click();
  await page.getByRole('button', { name: 'Confirm check-out' }).click();
  await expect(shift).toContainText('Completed');
  await expect(shift.getByRole('button')).toHaveCount(0);
  await page.getByLabel('Facility', { exact: true }).selectOption('mer-north');
  await expect(page.getByText('No shifts match this roster date and filters.')).toBeVisible();
  await page.goto('/work/biomedical');
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
});

test('replenishes pharmacy stock through requisition, purchase order and partial receipts', async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  const batch = 'PROC-BATCH-601';
  const expiry = shiftDay(dayInIndia(), 100);
  await signIn(page, 'stores');
  await expect(page.getByRole('heading', { name: 'Inventory & Stores' })).toBeVisible();
  const buyer = await page.context().newPage();
  await signIn(buyer, 'procurement');
  await expect(buyer.getByText('No requisitions match these filters.')).toBeVisible();

  const create = page.getByRole('button', { name: 'Create requisition' });
  await create.focus();
  await page.keyboard.press('Enter');
  const request = page.getByRole('dialog', { name: 'Create requisition' });
  await expect(request).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(create).toBeFocused();
  await create.click();
  await request.getByLabel('Catalogue item').selectOption('hydration');
  await request.getByLabel('Requisition purpose').selectOption('Routine replenishment');
  await request.getByLabel('Requested quantity').fill('8');
  await request.getByRole('button', { name: 'Submit requisition' }).click();
  const storeRequest = page
    .getByRole('region', { name: 'Stock requisitions', exact: true })
    .getByRole('row', { name: /Oral hydration sachets/ });
  await expect(storeRequest).toContainText('Requested');
  const buyingRequest = buyer.getByRole('row', { name: /Oral hydration sachets/ });
  await expect(buyingRequest.getByRole('button', { name: 'Issue purchase order' })).toHaveCount(0);
  await buyingRequest.getByRole('button', { name: 'Approve requisition' }).click();
  await buyer.getByRole('button', { name: 'Confirm approval' }).click();
  await expect(storeRequest).toContainText('Approved');
  await buyingRequest.getByRole('button', { name: 'Issue purchase order' }).click();
  const order = buyer.getByRole('dialog', { name: 'Issue purchase order' });
  const supplier = order.getByLabel('Supplier', { exact: true });
  await expect(supplier.locator('option', { hasText: 'Harbor Care Supplies' })).toHaveCount(0);
  await supplier.selectOption('mer-central-supplier-1');
  await expect(order.getByText('₹168.00', { exact: true })).toBeVisible();
  await order.getByRole('button', { name: 'Confirm purchase order' }).click();
  const register = buyer.getByRole('row', { name: /Fieldstone Medical Supply/ });
  await expect(register).toContainText('0 of 8 received');
  const reference = (await register.getByRole('cell').first().innerText()).match(
    /PO-[A-F0-9]{8}/,
  )?.[0];
  expect(reference).toBeTruthy();
  await page.getByRole('button', { name: 'Receiving', exact: true }).click();
  const delivery = page.getByRole('row', { name: new RegExp(reference!) });
  const receipt = page.getByRole('dialog', { name: 'Post goods receipt' });
  async function fillReceipt(code: string, quantity: string) {
    await delivery.getByRole('button', { name: 'Receive goods' }).click();
    await receipt.getByLabel('Batch code').fill(batch);
    await receipt.getByLabel('Expiry date').fill(expiry);
    await receipt.getByLabel('Received quantity').fill(quantity);
    await receipt.getByLabel('Receipt reference').fill(code);
  }
  await fillReceipt('GRN-601-PROC', '9');
  await receipt.getByRole('button', { name: 'Save receipt' }).click();
  await expect(receipt.getByRole('alert')).toContainText('exceeds the remaining order quantity');
  await receipt.getByLabel('Received quantity').fill('3');
  await receipt.getByRole('button', { name: 'Save receipt' }).click();
  await expect(delivery).toContainText('3 of 8');
  await expect(register).toContainText('Partially received');
  await expect(register.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);

  const pharmacy = await page.context().newPage();
  await signIn(pharmacy, 'pharmacy');
  await pharmacy.getByRole('button', { name: 'Stock lots', exact: true }).click();
  await pharmacy.getByRole('searchbox', { name: 'Search stock lots' }).fill(batch);
  const pharmacyLot = pharmacy.getByRole('row', { name: new RegExp(batch) });
  await expect(pharmacyLot.getByRole('cell', { name: '3', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Receiving', exact: true }).click();
  await fillReceipt('GRN-602-PROC', '5');
  await receipt.getByRole('button', { name: 'Save receipt' }).click();
  await expect(delivery).toContainText('8 of 8');
  await expect(delivery.getByRole('button', { name: 'Receive goods' })).toHaveCount(0);
  await expect(pharmacyLot.getByRole('cell', { name: '8', exact: true })).toBeVisible();
  await expect(register).toContainText('8 of 8 received');
  await checkReflow(page);
  await checkReflow(buyer);
  await page.setViewportSize({ width: 390, height: 844 });
  await delivery.getByRole('button', { name: 'View receipts' }).click();
  const history = page.getByRole('dialog', { name: 'Goods receipt history' });
  await expect(history).toContainText('GRN-601-PROC');
  await expect(history).toContainText('GRN-602-PROC');
  for (const [tab, name] of [
    [page, 'receiving-390'],
    [buyer, 'procurement-1440'],
  ] as const) {
    expect(
      (await new AxeBuilder({ page: tab }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await tab.screenshot({ path: testInfo.outputPath(name + '.png'), animations: 'disabled' });
  }
  await history.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Stock levels', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find stock lot' }).fill(batch);
  const localLot = page.getByRole('row', { name: new RegExp(batch) });
  await localLot.getByRole('button', { name: 'Record count' }).click();
  const count = page.getByRole('dialog', { name: 'Record stock count' });
  await count.getByLabel('Counted on-hand quantity').fill('7');
  await count.getByLabel('Count reason').selectOption('Cycle count');
  await count.getByLabel('Count reference').fill('CNT-601-PROC');
  await count.getByRole('button', { name: 'Save stock count' }).click();
  await expect(pharmacyLot.getByRole('cell', { name: '7', exact: true })).toBeVisible();
  await pharmacy.getByRole('button', { name: 'Stock activity', exact: true }).click();
  await pharmacy.getByRole('searchbox', { name: 'Search stock activity' }).fill(batch);
  await expect(pharmacy.getByRole('row', { name: /Count adjustment.*CNT-601-PROC/ })).toContainText(
    '-1',
  );
  await expect(
    pharmacy.getByRole('row', { name: new RegExp('GRN-602-PROC.*' + reference) }),
  ).toBeVisible();
  await page.goto('/work/procurement');
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await buyer.close();
  await pharmacy.close();
});

test('schedules imaging and releases the reviewed report to the patient', async ({
  page,
}, testInfo) => {
  test.setTimeout(170_000);
  const patientId = 'TC-MERIDIAN-01001';
  const patient = await page.context().newPage();
  await signIn(patient, 'patient');
  await patient.getByRole('button', { name: 'Appointment pass', exact: true }).click();
  const pass = patient.getByRole('dialog', { name: 'Appointment pass' });
  const code = await pass.locator('code').innerText();
  await pass.getByRole('button', { name: 'Close', exact: true }).click();
  await patient.getByRole('button', { name: 'Reports', exact: true }).click();

  await signIn(page, 'reception');
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
  const clinical = clinician.getByRole('row', { name: new RegExp(patientId) });
  await clinical.getByRole('button', { name: 'Start consultation' }).click();
  await clinical.getByRole('button', { name: 'Review consultation' }).click();
  const imaging = clinician.getByRole('region', { name: 'Consultation imaging' });
  await imaging.getByLabel('Imaging study').selectOption('Chest radiograph');
  await imaging.getByRole('button', { name: 'Order imaging' }).click();
  await expect(imaging.getByText('Imaging order sent to Radiology.')).toBeVisible();
  await imaging.getByLabel('Imaging study').selectOption('Extremity radiograph');
  await imaging.getByRole('button', { name: 'Order imaging' }).click();
  await expect(imaging.locator('strong').filter({ hasText: 'Extremity radiograph' })).toBeVisible();

  const technician = await page.context().newPage();
  await signIn(technician, 'imaging');
  await expect(technician.getByRole('heading', { name: 'Radiology & Imaging' })).toBeVisible();
  await technician.getByRole('searchbox', { name: 'Find imaging order' }).fill(patientId);
  const chest = technician.getByRole('row', { name: new RegExp(patientId + '.*Chest radiograph') });
  const scheduleButton = chest.getByRole('button', { name: 'Schedule exam', exact: true });
  await scheduleButton.focus();
  await technician.keyboard.press('Enter');
  const editor = technician.getByRole('dialog', { name: 'Schedule exam' });
  await expect(editor).toBeVisible();
  await technician.keyboard.press('Escape');
  await expect(scheduleButton).toBeFocused();
  await scheduleButton.click();
  await editor.getByLabel('Available time (IST)').selectOption('13:00');
  await editor.getByRole('button', { name: 'Save booking' }).click();
  await expect(chest).toContainText('Scheduled');
  const second = technician.getByRole('row', {
    name: new RegExp(patientId + '.*Extremity radiograph'),
  });
  await second.getByRole('button', { name: 'Schedule exam', exact: true }).click();
  await expect(
    editor.getByLabel('Available time (IST)').locator('option', { hasText: '13:00' }),
  ).toHaveCount(0);
  await technician.keyboard.press('Escape');
  await second.getByRole('button', { name: 'Cancel order' }).click();
  await technician.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(second).toContainText('Cancelled');
  await technician.getByRole('button', { name: 'Modality schedule' }).click();
  await technician.getByLabel('Modality', { exact: true }).selectOption('X-ray');
  await expect(chest).toContainText('13:00 IST');
  await expect(second).toHaveCount(0);
  await checkReflow(technician);
  expect(
    (
      await new AxeBuilder({ page: technician })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await technician.screenshot({
    path: testInfo.outputPath('radiology-schedule-1440.png'),
    animations: 'disabled',
  });
  const engineer = await page.context().newPage();
  await signIn(engineer, 'biomedical');
  await expect(engineer.getByRole('heading', { name: 'Biomedical Engineering' })).toBeVisible();
  const xray = engineer.getByRole('row', { name: /IMG-01/ });
  const openWork = xray.getByRole('button', { name: 'Open work order' });
  await openWork.focus();
  await engineer.keyboard.press('Enter');
  const work = engineer.getByRole('dialog', { name: 'Open work order' });
  await expect(work).toBeVisible();
  await engineer.keyboard.press('Escape');
  await expect(openWork).toBeFocused();
  await openWork.click();
  await work.getByLabel('Maintenance reason').selectOption('Fault reported');
  await work.getByRole('button', { name: 'Open work order' }).click();
  await expect(chest).toContainText('Room out of service');
  await expect(chest.getByRole('button', { name: 'Record acquisition' })).toHaveCount(0);
  await expect(chest.getByRole('button', { name: 'Cancel order' })).toBeVisible();
  await engineer.reload();
  await expect(xray).toContainText('Unavailable');
  await xray.getByRole('button', { name: 'View work orders' }).click();
  await xray.getByRole('button', { name: 'Start maintenance' }).click();
  await engineer.getByRole('button', { name: 'Confirm start' }).click();
  await xray.getByRole('button', { name: 'Record functional check' }).click();
  await engineer.getByRole('checkbox', { name: 'I recorded the local functional check.' }).check();
  await engineer.getByRole('button', { name: 'Save functional check' }).click();
  await expect(xray).toContainText('Ready for release');
  await expect(chest).toContainText('Room out of service');
  await checkReflow(engineer);
  expect(
    (await new AxeBuilder({ page: engineer }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await engineer.screenshot({
    path: testInfo.outputPath('biomedical-1440.png'),
    animations: 'disabled',
  });
  await xray.getByRole('button', { name: 'Return to service' }).click();
  await engineer.getByRole('button', { name: 'Confirm return to service' }).click();
  await expect(xray).toContainText('Completed');
  await expect(chest.getByText('Room out of service')).toHaveCount(0);
  await chest.getByRole('button', { name: 'Record acquisition' }).click();
  await technician.getByRole('button', { name: 'Confirm acquisition' }).click();
  await expect(chest).toContainText('Acquired');
  await expect(chest.getByRole('button', { name: 'Prepare report' })).toHaveCount(0);

  const reviewer = await page.context().newPage();
  await signIn(reviewer, 'radiologist');
  await reviewer.getByRole('searchbox', { name: 'Find imaging order' }).fill(patientId);
  const pending = reviewer.getByRole('row', { name: /Chest radiograph/ });
  await pending.getByRole('button', { name: 'Prepare report' }).click();
  const draft = reviewer.getByRole('dialog', { name: 'Prepare imaging report' });
  await draft.getByLabel('Demo report summary').selectOption('Image series documented');
  await draft.getByRole('button', { name: 'Save imaging report' }).click();
  await expect(pending).toContainText('Report ready');
  const openReport = patient.getByRole('button', { name: 'View imaging report' });
  await expect(openReport).toHaveCount(0);
  await expect(imaging.getByText('Image series documented')).toHaveCount(0);
  await pending.getByRole('button', { name: 'Review release' }).click();
  await reviewer.getByRole('button', { name: 'Confirm release' }).click();
  await expect(pending).toContainText('Published');
  await expect(imaging.getByText('Image series documented')).toBeVisible();
  await patient.reload();
  await patient.getByRole('button', { name: 'Reports', exact: true }).click();
  await patient.setViewportSize({ width: 390, height: 844 });
  await openReport.click();
  const report = patient.getByRole('dialog', { name: 'Chest radiograph' });
  await expect(report).toContainText('Image series documented');
  expect(
    (await new AxeBuilder({ page: patient }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await patient.screenshot({
    path: testInfo.outputPath('imaging-report-390.png'),
    animations: 'disabled',
  });
  await patient.goto('/work/radiology');
  await expect(patient.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  for (const tab of [patient, clinician, technician, reviewer, engineer]) await tab.close();
});

test('hands a ward component request through review, reservation and issue', async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  const patientId = 'TC-MERIDIAN-01001';
  await signIn(page, 'admissions');
  await page.getByRole('button', { name: 'Request admission' }).click();
  const admission = page.getByRole('dialog', { name: 'Request admission' });
  await admission.getByLabel('Find patient').fill(patientId);
  await admission.getByLabel('Patient', { exact: true }).selectOption(patientId);
  await admission.getByRole('button', { name: 'Request admission' }).click();
  await page.getByLabel('Find admission').fill(patientId);
  const admitted = page.getByRole('row', { name: new RegExp(patientId) });
  await admitted.getByRole('button', { name: 'Allocate bed' }).click();
  const allocate = page.getByRole('dialog', { name: 'Assign bed' });
  await allocate.getByLabel('Available bed').selectOption({ index: 1 });
  await allocate.getByRole('button', { name: 'Confirm bed allocation' }).click();
  await admitted.getByRole('button', { name: 'Assign care team' }).click();
  const team = page.getByRole('dialog', { name: 'Assign care team' });
  await team.getByLabel('Inpatient physician').selectOption('wardphysician');
  await team.getByLabel('Ward nurse').selectOption('wardnurse');
  await team.getByRole('button', { name: 'Save care team' }).click();
  await expect(page.getByText('Care team assigned.')).toBeVisible();

  const physician = await page.context().newPage();
  await signIn(physician, 'wardphysician');
  await physician.getByRole('searchbox', { name: 'Find assigned patient' }).fill(patientId);
  await physician
    .getByRole('row', { name: new RegExp(patientId) })
    .getByRole('link', { name: 'Open care plan' })
    .click();
  const plan = physician.getByRole('region', { name: 'Blood component requests' });
  await plan.getByRole('button', { name: 'Request component' }).click();
  const component = physician.getByRole('dialog', { name: 'Request blood component' });
  await component.getByLabel('Blood component').selectOption('Red cells');
  await component.getByRole('button', { name: 'Send request' }).click();
  await expect(plan).toContainText('Requested');
  await admitted.getByRole('button', { name: 'Discharge', exact: true }).click();
  const discharge = page.getByRole('dialog', { name: 'Discharge patient' });
  await discharge.getByRole('button', { name: 'Confirm discharge' }).click();
  await expect(discharge.getByRole('alert')).toContainText('Resolve open blood component requests');
  await discharge.getByRole('button', { name: 'Close', exact: true }).click();

  const officer = await page.context().newPage();
  await signIn(officer, 'bloodbank');
  await expect(officer.getByRole('heading', { name: 'Blood Bank' })).toBeVisible();
  await officer.getByRole('searchbox', { name: 'Find component request' }).fill(patientId);
  const request = officer.getByRole('row', { name: new RegExp(patientId) });
  const reviewButton = request.getByRole('button', { name: 'Review request', exact: true });
  await checkReflow(officer);
  await officer.setViewportSize({ width: 390, height: 844 });
  await reviewButton.focus();
  await officer.keyboard.press('Enter');
  const review = officer.getByRole('dialog', { name: 'Review component request' });
  await expect(review).toBeVisible();
  await officer.keyboard.press('Escape');
  await expect(reviewButton).toBeFocused();
  await reviewButton.click();
  const unit = review.getByLabel('Available component unit');
  await expect(unit.locator('option', { hasText: 'BB-103' })).toHaveCount(0);
  await unit.selectOption('mer-central-BB-101');
  const reserve = review.getByRole('button', { name: 'Reserve unit' });
  await expect(reserve).toBeDisabled();
  await review.getByRole('checkbox', { name: /recorded the compatibility review/ }).check();
  await expect(reserve).toBeEnabled();
  expect(
    (await new AxeBuilder({ page: officer }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await officer.screenshot({
    path: testInfo.outputPath('blood-bank-review-390.png'),
    animations: 'disabled',
  });
  await reserve.click();
  await expect(plan).toContainText('Reserved');
  await officer.reload();
  const reserved = officer.getByRole('row', { name: new RegExp(patientId) });
  await expect(reserved).toContainText('BB-101');
  await reserved.getByRole('button', { name: 'Issue unit' }).click();
  await officer.getByRole('button', { name: 'Confirm issue' }).click();
  await expect(reserved).toContainText('Issued');
  await expect(plan).toContainText('Issued');
  await officer.getByRole('button', { name: 'Unit inventory' }).click();
  await officer.getByLabel('Status', { exact: true }).selectOption('Issued');
  await expect(officer.getByRole('row', { name: /BB-101/ })).toContainText('Issued');
  await expect(officer.getByRole('row', { name: /BB-103/ })).toHaveCount(0);
  await officer.goto('/work/radiology');
  await expect(officer.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await officer.close();
  await physician.close();
});

test('hands an emergency patient through ICU step-down and theatre recovery', async ({
  page,
}, testInfo) => {
  test.setTimeout(170_000);
  const patientId = 'TC-MERIDIAN-01001';
  await signIn(page, 'emergency');
  await page.getByRole('button', { name: 'Record arrival' }).click();
  const arrival = page.getByRole('dialog', { name: 'Record emergency arrival' });
  await arrival.getByLabel('Find registered patient').fill(patientId);
  await arrival.getByLabel('Patient', { exact: true }).selectOption(patientId);
  await arrival.getByLabel('Arrival mode').selectOption('Facility referral');
  await arrival.getByRole('button', { name: 'Save arrival' }).click();
  const emergency = page.getByRole('row', { name: new RegExp(patientId) });
  await expect(emergency).toContainText('Awaiting assessment');
  await expect(emergency).toContainText('Unassigned');
  await expect(emergency.getByRole('button', { name: 'Request admission' })).toHaveCount(0);
  const assess = emergency.getByRole('button', { name: 'Record assessment' });
  await assess.focus();
  await page.keyboard.press('Enter');
  const assessment = page.getByRole('dialog', { name: 'Record clinical assessment' });
  await expect(assessment).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(assess).toBeFocused();
  await assess.click();
  await assessment.getByLabel('Clinician-assigned priority').selectOption('Urgent');
  await assessment.getByRole('button', { name: 'Save assessment' }).click();
  await expect(emergency).toContainText('Under care');
  await emergency.getByRole('button', { name: 'Request admission' }).click();
  await page
    .getByRole('dialog', { name: 'Request inpatient admission' })
    .getByRole('button', { name: 'Confirm admission request' })
    .click();
  await expect(emergency).toContainText('Admission requested');

  const admissions = await page.context().newPage();
  await signIn(admissions, 'admissions');
  await admissions.getByRole('button', { name: 'Admissions', exact: true }).click();
  await admissions.getByLabel('Find admission').fill(patientId);
  const admission = admissions.getByRole('row', { name: new RegExp(patientId) });
  await expect(admission).toContainText('Requested');
  const icu = await page.context().newPage();
  await signIn(icu, 'icu');
  await icu.getByRole('searchbox', { name: 'Search worklist' }).fill(patientId);
  const inIcu = icu.getByRole('row', { name: new RegExp(patientId) });
  await expect(inIcu).toHaveCount(0);
  await admission.getByRole('button', { name: 'Allocate bed' }).click();
  const allocate = admissions.getByRole('dialog', { name: 'Assign bed' });
  const beds = allocate.getByLabel('Available bed');
  const icuBed = await beds
    .locator('option', { hasText: 'Critical care' })
    .first()
    .getAttribute('value');
  await beds.selectOption(icuBed!);
  await allocate.getByRole('button', { name: 'Confirm bed allocation' }).click();
  await expect(emergency).toContainText('Admitted');
  await inIcu.getByRole('button', { name: 'Record review' }).click();
  const review = icu.getByRole('dialog', { name: 'Record ICU review' });
  await review.getByLabel('Review focus').selectOption('Team handoff');
  await review.getByLabel('Review outcome').selectOption('Handoff ready');
  await review.getByRole('button', { name: 'Save review' }).click();
  await expect(inIcu).toContainText('Handoff ready');
  await icu.reload();
  await icu.getByRole('searchbox', { name: 'Search worklist' }).fill(patientId);
  await inIcu.getByRole('button', { name: 'Review history' }).click();
  const history = icu.getByRole('dialog', { name: 'ICU review history' });
  await expect(history.getByText('Handoff ready')).toBeVisible();
  await history.getByRole('button', { name: 'Close', exact: true }).click();
  await inIcu.getByRole('button', { name: 'Request step-down' }).click();
  await icu
    .getByRole('dialog', { name: 'Request ICU step-down' })
    .getByRole('button', { name: 'Confirm step-down' })
    .click();
  await expect(admission).toContainText('ICU step-down requested');

  await checkReflow(page);
  await checkReflow(icu);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [workspace, name] of [
    [page, 'emergency-390'],
    [icu, 'critical-care-1440'],
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
  await admission.getByRole('button', { name: 'Transfer bed' }).click();
  const wardBed = await beds
    .locator('option')
    .filter({ hasText: /General ward/ })
    .first()
    .getAttribute('value');
  await beds.selectOption(wardBed!);
  await allocate.getByRole('button', { name: 'Confirm bed allocation' }).click();
  await expect(inIcu).toHaveCount(0);
  await expect(admission).not.toContainText('ICU step-down requested');

  const theatre = await page.context().newPage();
  await signIn(theatre, 'theatre');
  const booking = theatre.getByRole('dialog', { name: 'Schedule theatre case' });
  async function schedule() {
    await theatre.getByRole('button', { name: 'Schedule case' }).click();
    await booking.getByLabel('Find active admission').fill(patientId);
    const pick = booking.getByLabel('Admission', { exact: true });
    const id = await pick.locator('option', { hasText: patientId }).getAttribute('value');
    await pick.selectOption(id!);
    await booking.getByLabel('Procedure category').selectOption('Day procedure');
    await booking.getByLabel('Theatre', { exact: true }).selectOption('Theatre 1');
    await booking.getByLabel('Starts at').selectOption('08:00');
    await booking.getByLabel('Ends at').selectOption('09:00');
    await booking.getByRole('button', { name: 'Save booking' }).click();
  }
  await schedule();
  const theatreRow = theatre.getByRole('row', { name: new RegExp(patientId) });
  await expect(theatreRow).toContainText('Scheduled');
  await schedule();
  await expect(booking.getByRole('alert')).toContainText('already booked during that interval');
  await booking.getByRole('button', { name: 'Close', exact: true }).click();
  await admission.getByRole('button', { name: 'Discharge', exact: true }).click();
  const discharge = admissions.getByRole('dialog', { name: 'Discharge patient' });
  await discharge.getByRole('button', { name: 'Confirm discharge' }).click();
  await expect(discharge.getByRole('alert')).toContainText('Complete or cancel open theatre cases');
  await discharge.getByRole('button', { name: 'Close', exact: true }).click();
  for (const [action, status] of [
    ['Mark ready', 'Ready'],
    ['Start case', 'In theatre'],
    ['Move to recovery', 'Recovery'],
    ['Complete case', 'Completed'],
  ]) {
    await theatreRow.getByRole('button', { name: action, exact: true }).click();
    await theatre
      .getByRole('dialog', { name: action })
      .getByRole('button', { name: 'Confirm change' })
      .click();
    await expect(theatreRow).toContainText(status);
  }
  await theatre.reload();
  await expect(theatreRow).toContainText('Completed');
  await checkReflow(theatre);
  expect(
    (await new AxeBuilder({ page: theatre }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await theatre.screenshot({
    path: testInfo.outputPath('operation-theatre-1440.png'),
    animations: 'disabled',
    fullPage: true,
  });
  const tomorrow = shiftDay(dayInIndia(), 1);
  await theatre.getByLabel('Theatre date', { exact: true }).fill(tomorrow);
  await expect(theatre).toHaveURL(new RegExp('day=' + tomorrow));
  await theatre.reload();
  await expect(theatre.getByLabel('Theatre date', { exact: true })).toHaveValue(tomorrow);
  await expect(
    theatre.getByText('No theatre cases match the selected date and filters.'),
  ).toBeVisible();
  await admission.getByRole('button', { name: 'Discharge', exact: true }).click();
  await discharge.getByRole('button', { name: 'Confirm discharge' }).click();
  await expect(emergency).toContainText('Closed');
  await theatre.goto('/work/emergency');
  await expect(theatre.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await theatre.close();
  await icu.close();
  await admissions.close();
});

test('hands an admitted patient from ward care through discharge and inpatient billing', async ({
  page,
}, testInfo) => {
  test.setTimeout(200_000);
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
  await expect(discharge.getByRole('alert')).toContainText('must sign the discharge summary');
  await discharge.getByRole('button', { name: 'Close' }).click();
  await admitted.getByRole('button', { name: 'Transfer bed' }).click();
  const transfer = page.getByRole('dialog', { name: 'Assign bed' });
  const nextBed = transfer.getByLabel('Available bed');
  const criticalBed = await nextBed
    .locator('option', { hasText: 'Critical care' })
    .first()
    .getAttribute('value');
  await nextBed.selectOption(criticalBed!);
  await transfer.getByRole('button', { name: 'Confirm bed allocation' }).click();
  await expect(physician.getByText(/Critical care · Bed/)).toBeVisible();

  const patient = await page.context().newPage();
  await signIn(patient, 'patient');
  await patient.getByRole('button', { name: 'Reports', exact: true }).click();
  const openSummary = patient.getByRole('button', { name: 'View discharge summary' });
  const cashier = await page.context().newPage();
  await signIn(cashier, 'cashier');
  await cashier.getByRole('button', { name: 'Inpatient charges' }).click();
  await cashier.getByRole('searchbox', { name: 'Find inpatient account' }).fill(patientId);
  const account = cashier.getByRole('row', { name: new RegExp(patientId) });
  await expect(account).toContainText('Accruing');
  const review = account.getByRole('button', { name: 'Review bed charges' });
  await review.focus();
  await cashier.keyboard.press('Enter');
  const ledger = cashier.getByRole('dialog', { name: 'Bed charge ledger' });
  const issue = ledger.getByRole('button', { name: 'Issue inpatient invoice' });
  await expect(ledger.getByRole('row', { name: /Critical care/ })).toBeVisible();
  await expect(issue).toHaveCount(0);
  await cashier.keyboard.press('Escape');
  await expect(review).toBeFocused();

  await physician.getByRole('button', { name: 'Prepare discharge summary' }).click();
  const draft = physician.getByRole('dialog', { name: 'Prepare discharge summary' });
  await draft.getByLabel('Destination').selectOption('Home');
  await draft.getByLabel('Stay summary').selectOption('Ward care reviewed');
  await draft.getByLabel('Follow-up handoff').selectOption('Arrange outpatient review');
  await draft.getByRole('button', { name: 'Save discharge draft' }).click();
  await expect(admitted).toContainText('Summary draft');
  await expect(openSummary).toHaveCount(0);
  await physician.reload();
  await physician.getByRole('button', { name: 'Edit discharge draft' }).click();
  await expect(draft.getByLabel('Destination')).toHaveValue('Home');
  await physician.keyboard.press('Escape');
  await physician.getByRole('button', { name: 'Sign summary' }).click();
  const sign = physician.getByRole('dialog', { name: 'Sign discharge summary' });
  await expect(sign).toContainText('Arrange outpatient review');
  await sign.getByRole('button', { name: 'Confirm signature' }).click();
  await expect(admitted).toContainText('Summary signed');
  await expect(openSummary).toHaveCount(0);
  await admitted.getByRole('button', { name: 'Discharge', exact: true }).click();
  await discharge.getByRole('button', { name: 'Confirm discharge' }).click();
  await expect(admitted).toContainText('Summary released');
  await expect(physician.getByRole('alert')).toContainText('This admission is no longer active');
  await expect(nurse.getByRole('alert')).toContainText('This admission is no longer active');
  await checkReflow(patient);
  await patient.setViewportSize({ width: 390, height: 844 });
  await openSummary.click();
  const summary = patient.getByRole('dialog', { name: 'Discharge summary' });
  await expect(summary).toContainText('Arrange outpatient review');
  await expect(summary).toContainText('Critical care');
  const download = patient.waitForEvent('download');
  await summary.getByRole('button', { name: 'Download summary' }).click();
  expect((await download).suggestedFilename()).toBe('truecare-discharge-summary.txt');
  await expect(account).toContainText('Ready to invoice');
  await checkReflow(cashier);
  await review.click();
  await expect(issue).toBeEnabled();
  await expect(ledger.getByRole('row', { name: /Critical care.*3,500/ })).toBeVisible();
  for (const [workspace, name] of [
    [patient, 'discharge-summary-390'],
    [cashier, 'inpatient-billing-1440'],
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
    });
  }
  await issue.click();
  await expect(cashier.getByRole('button', { name: 'Invoices', exact: true })).toBeFocused();
  const invoice = cashier.getByRole('row', { name: new RegExp(patientId + '.*Inpatient stay') });
  await expect(invoice).toContainText('Outstanding');
  await invoice.getByRole('button', { name: 'Record settlement' }).click();
  await cashier.getByRole('button', { name: 'Confirm settlement' }).click();
  await expect(invoice).toContainText('Paid');
  await patient.reload();
  await patient.getByRole('button', { name: 'Bills', exact: true }).click();
  await expect(patient.getByRole('article').filter({ hasText: 'Inpatient stay' })).toContainText(
    'Paid',
  );
  await patient.close();
  await cashier.close();
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
  const theatre = await page.context().newPage();
  const cashier = await page.context().newPage();
  const blood = await page.context().newPage();
  await signIn(ward, 'wardphysician');
  await signIn(nursing, 'wardnurse');
  await signIn(theatre, 'theatre');
  await signIn(cashier, 'cashier');
  await signIn(blood, 'bloodbank');
  await expect(blood.getByRole('heading', { name: 'Blood Bank' })).toBeVisible();
  const inpatientCharges = cashier.getByRole('button', { name: 'Inpatient charges' });
  await inpatientCharges.click();
  await expect(cashier.getByRole('heading', { name: 'Inpatient accounts' })).toBeVisible();
  await expect(ward.getByRole('heading', { name: 'Inpatient Physician' })).toBeVisible();
  await expect(nursing.getByRole('heading', { name: 'Nursing Station' })).toBeVisible();
  await expect(theatre.getByRole('heading', { name: 'Operation Theatre' })).toBeVisible();
  const biomedical = await page.context().newPage();
  await signIn(biomedical, 'biomedical');
  const support = await page.context().newPage();
  const transport = await page.context().newPage();
  await signIn(support, 'support');
  await signIn(transport, 'transport');
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
  await expect(theatre.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await expect(inpatientCharges).toHaveCount(0);
  await expect(blood.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await expect(support.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await expect(transport.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await expect(cashier.getByRole('heading', { name: 'Invoices' })).toBeVisible();
  await biomedical.getByRole('button', { name: 'Register equipment' }).click();
  const register = biomedical.getByRole('dialog', { name: 'Register equipment' });
  await expect(register.getByLabel('Location').locator('option')).toHaveText([
    'Choose a location',
    'Outpatient',
  ]);
  await register.getByLabel('Equipment tag').fill('LIGHT-04');
  await register.getByLabel('Category').selectOption('Examination light');
  await register.getByLabel('Location').selectOption('Outpatient');
  await register.getByRole('button', { name: 'Save equipment' }).click();
  await expect(
    biomedical.getByRole('row', { name: /LIGHT-04.*Outpatient.*Available/ }),
  ).toBeVisible();
  await biomedical.close();
  await support.close();
  await transport.close();
  await ward.close();
  await nursing.close();
  await theatre.close();
  await cashier.close();
  await blood.close();
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

test('registers, books, checks in and settles consultation charges through insurance and cashier', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
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
  const bill = page.getByRole('row', { name: new RegExp(id) });
  const claims = await page.context().newPage();
  await signIn(claims, 'claims');
  await claims.getByRole('searchbox', { name: 'Find insurance case' }).fill(id);
  const row = claims.getByRole('row', { name: new RegExp(id) });
  const addCoverage = row.getByRole('button', { name: 'Record coverage' });
  await addCoverage.focus();
  await claims.keyboard.press('Enter');
  const coverage = claims.getByRole('dialog', { name: 'Record patient coverage' });
  await expect(coverage).toBeVisible();
  await claims.keyboard.press('Escape');
  await expect(addCoverage).toBeFocused();
  await addCoverage.click();
  await coverage.getByLabel('Payer', { exact: true }).selectOption('Meridian Health Cover');
  await coverage.getByLabel('Policy code').fill('DEMO-3002');
  await coverage.getByRole('button', { name: 'Save coverage' }).click();
  await expect(row).toContainText('Coverage recorded');
  await row.getByRole('button', { name: 'Request preauthorisation' }).click();
  await claims.getByRole('button', { name: 'Save request' }).click();
  await expect(bill).toContainText('Insurance pending');
  await expect(bill.getByRole('button', { name: 'Record settlement' })).toHaveCount(0);
  const update = claims.getByRole('dialog', { name: 'Update insurance claim' });
  async function action(value: string, status: string) {
    await row.getByRole('button', { name: 'Update claim' }).click();
    await update.getByLabel('Claim action').selectOption(value);
    await update.getByRole('button', { name: 'Save claim action' }).click();
    await expect(row).toContainText(status);
  }
  await row.getByRole('button', { name: 'Update claim' }).click();
  await update.getByLabel('Claim action').selectOption('authorise');
  await update.getByLabel('Approved amount (₹)').fill('751');
  await update.getByRole('button', { name: 'Save claim action' }).click();
  await expect(update.getByRole('alert')).toContainText('no greater');
  await update.getByLabel('Approved amount (₹)').fill('500');
  await update.getByRole('button', { name: 'Save claim action' }).click();
  await expect(row).toContainText('Authorised');
  await action('prepare', 'Prepared');
  await action('submit', 'Submitted');
  await claims.reload();
  await claims.getByRole('searchbox', { name: 'Find insurance case' }).fill(id);
  await action('settle', 'Settled');
  await expect(bill.getByRole('cell', { name: '₹250.00', exact: true })).toBeVisible();
  await checkReflow(claims);
  expect(
    (await new AxeBuilder({ page: claims }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await claims.screenshot({
    path: testInfo.outputPath('insurance-1440.png'),
    animations: 'disabled',
  });
  const finance = await page.context().newPage();
  await signIn(finance, 'finance');
  await expect(finance.getByRole('row', { name: /Payer collections/ })).toContainText('₹500.00');
  await bill.getByRole('button', { name: 'Record settlement' }).click();
  await page.getByRole('button', { name: 'Confirm settlement' }).click();
  await expect(bill).toContainText('Paid');
  await page.reload();
  await expect(bill).toContainText('Paid');
  await finance.goto('/work/insurance');
  await expect(finance.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await claims.close();
  await finance.close();
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

test('tracks pharmacy receipts, supplier returns and a credited patient return', async ({
  page,
}, testInfo) => {
  test.setTimeout(170_000);
  const patientId = 'TC-MERIDIAN-01001';
  await signIn(page, 'pharmacy');
  const receive = page.getByRole('button', { name: 'Receive stock', exact: true });
  await receive.focus();
  await page.keyboard.press('Enter');
  const receipt = page.getByRole('dialog', { name: 'Receive stock' });
  await expect(receipt).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(receive).toBeFocused();
  await receive.click();
  await receipt.getByLabel('Medication', { exact: true }).selectOption('hydration');
  await receipt.getByLabel('Batch code').fill('PH-NEW-601');
  await receipt.getByLabel('Expiry date').fill(shiftDay(dayInIndia(), 120));
  await receipt.getByLabel('Stock reference').fill('GRN-601');
  await receipt.getByLabel('Quantity', { exact: true }).fill('8');
  await receipt.getByRole('button', { name: 'Save receipt' }).click();
  const stocked = page.getByRole('row', { name: /PH-NEW-601/ });
  await expect(stocked.getByRole('cell', { name: '8', exact: true })).toBeVisible();
  await stocked.getByRole('button', { name: 'Return to supplier' }).click();
  const supplier = page.getByRole('dialog', { name: 'Return stock to supplier' });
  await supplier.getByLabel('Return reason').selectOption('Incorrect shipment');
  await supplier.getByLabel('Stock reference').fill('SR-601');
  await supplier.getByLabel('Quantity', { exact: true }).fill('2');
  await supplier.getByRole('button', { name: 'Confirm return' }).click();
  await expect(stocked.getByRole('cell', { name: '6', exact: true })).toBeVisible();

  const patient = await page.context().newPage();
  await signIn(patient, 'patient');
  await patient.getByRole('button', { name: 'Appointment pass', exact: true }).click();
  const passDialog = patient.getByRole('dialog', { name: 'Appointment pass' });
  const pass = await passDialog.locator('code').innerText();
  await passDialog.getByRole('button', { name: 'Close', exact: true }).click();
  await patient.getByRole('button', { name: 'Medications', exact: true }).click();
  const history = patient.getByRole('region', { name: 'Dispensed medications' });
  await expect(history).toContainText('There are no dispensed medications');

  const desk = await page.context().newPage();
  await signIn(desk, 'reception');
  await desk
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('link', { name: 'Consultation queue' })
    .click();
  await desk.getByRole('button', { name: 'Verify arrival' }).click();
  const checkIn = desk.getByRole('dialog', { name: 'Verify arrival' });
  await checkIn.getByLabel('Appointment pass code').fill(pass);
  await checkIn.getByRole('button', { name: 'Check in patient' }).click();
  await desk.getByRole('searchbox', { name: 'Search appointments' }).fill(patientId);
  await desk
    .getByRole('row', { name: new RegExp(patientId) })
    .getByRole('button', { name: 'Call token' })
    .click();

  const clinician = await page.context().newPage();
  await signIn(clinician, 'clinician');
  await clinician.getByRole('searchbox', { name: 'Search appointments' }).fill(patientId);
  const care = clinician.getByRole('row', { name: new RegExp(patientId) });
  await care.getByRole('button', { name: 'Start consultation' }).click();
  await care.getByRole('button', { name: 'Review consultation' }).click();
  const visit = clinician.getByRole('dialog', { name: 'Consultation' });
  await visit.getByLabel('Medication', { exact: true }).selectOption('hydration');
  await visit.getByLabel('Dispensing quantity').fill('3');
  await visit.getByRole('button', { name: 'Save prescription draft' }).click();
  await visit.getByRole('button', { name: 'Sign prescription' }).click();

  await page.getByRole('button', { name: 'Prescriptions', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search prescriptions' }).fill(patientId);
  const order = page.getByRole('row', { name: new RegExp(patientId + '.*Oral hydration sachets') });
  await order.getByRole('button', { name: 'Dispense', exact: true }).click();
  const dispense = page.getByRole('dialog', { name: 'Dispense medication' });
  const lot = dispense.getByLabel('Eligible stock lot');
  const receivedLot = await lot.locator('option', { hasText: 'PH-NEW-601' }).getAttribute('value');
  await lot.selectOption(receivedLot!);
  await dispense.getByRole('button', { name: 'Confirm dispensing' }).click();
  await expect(history).toContainText('3 dispensed');

  const cashier = await page.context().newPage();
  await signIn(cashier, 'cashier');
  const bill = cashier.getByRole('row', {
    name: new RegExp(patientId + '.*Oral hydration sachets'),
  });
  await expect(bill).toContainText('₹96.00');
  await order.getByRole('button', { name: 'Record patient return' }).click();
  const returned = page.getByRole('dialog', { name: 'Record patient return' });
  await returned.getByLabel('Return reason').selectOption('Unused medication returned');
  await returned.getByLabel('Stock reference').fill('PR-601');
  await returned.getByLabel('Quantity', { exact: true }).fill('4');
  await returned.getByRole('button', { name: 'Confirm return' }).click();
  await expect(returned.getByRole('alert')).toContainText('within the displayed limit');
  await returned.getByLabel('Quantity', { exact: true }).fill('1');
  await returned.getByRole('button', { name: 'Confirm return' }).click();
  await expect(order).toContainText('1 returned');
  await expect(bill).toContainText('₹32.00 credited');
  await expect(bill.getByRole('cell', { name: '₹64.00', exact: true })).toBeVisible();
  await expect(history).toContainText('1 returned to Pharmacy');

  await page.getByRole('button', { name: 'Stock lots', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search stock lots' }).fill('PH-NEW-601');
  await expect(stocked).toContainText('1 quarantined');
  await expect(stocked.getByRole('cell', { name: '3 1 quarantined' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Stock activity', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search stock activity' }).fill('PH-NEW-601');
  for (const label of ['Received', 'Supplier return', 'Dispensed', 'Patient return']) {
    await expect(page.getByRole('row', { name: new RegExp('PH-NEW-601.*' + label) })).toBeVisible();
  }
  await checkReflow(page);
  await checkReflow(patient);
  await patient.setViewportSize({ width: 390, height: 844 });
  for (const [tab, name] of [
    [page, 'pharmacy-ledger-1440'],
    [patient, 'patient-medications-390'],
  ] as const) {
    expect(
      (await new AxeBuilder({ page: tab }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await tab.screenshot({ path: testInfo.outputPath(name + '.png'), animations: 'disabled' });
  }
  await bill.getByRole('button', { name: 'Record settlement' }).click();
  await cashier.getByRole('button', { name: 'Confirm settlement' }).click();
  await expect(bill).toContainText('Paid');
  await patient.getByRole('button', { name: 'Bills', exact: true }).click();
  await expect(patient.getByRole('article').filter({ hasText: '₹32.00 credited' })).toContainText(
    'Paid',
  );
  await page.getByRole('button', { name: 'Prescriptions', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search prescriptions' }).fill(patientId);
  await order.getByRole('button', { name: 'Record patient return' }).click();
  await returned.getByLabel('Return reason').selectOption('Unused medication returned');
  await returned.getByLabel('Stock reference').fill('PR-602');
  await returned.getByRole('button', { name: 'Confirm return' }).click();
  await expect(bill).toContainText('₹32.00 needs payment review');
  const finance = await page.context().newPage();
  await signIn(finance, 'finance');
  await finance.getByRole('button', { name: 'Return reviews', exact: true }).click();
  await finance
    .getByRole('row', { name: /PR-602/ })
    .getByRole('button', { name: 'Review return' })
    .click();
  const review = finance.getByRole('dialog', { name: 'Review medication return' });
  await review.getByLabel('Review decision').selectOption('Record local refund');
  await review.getByRole('button', { name: 'Save decision' }).click();
  await expect(bill).toContainText('₹32.00 refunded locally');
  await expect(patient.getByRole('article').filter({ hasText: '₹32.00 credited' })).toContainText(
    '₹32.00 refunded locally',
  );
  await finance.getByRole('button', { name: 'Collections', exact: true }).click();
  await expect(finance.getByRole('row', { name: /Local refunds/ })).toContainText('₹32.00');
  const net = finance.getByRole('row', { name: /Net collection/ }).getByRole('cell');
  const counted = (await net.innerText()).replace(/[^0-9.-]/g, '');
  await finance.getByRole('button', { name: 'Reconcile day' }).click();
  const reconcile = finance.getByRole('dialog', { name: 'Reconcile collections' });
  const amount = reconcile.getByLabel('Counted net collection (₹)');
  await amount.fill(String(Number(counted) + 1));
  await reconcile.getByRole('button', { name: 'Confirm close' }).click();
  await expect(reconcile.getByRole('alert')).toContainText('must match');
  await amount.fill(counted);
  await reconcile.getByRole('button', { name: 'Confirm close' }).click();
  await expect(finance.getByText('Closed', { exact: true })).toBeVisible();
  await finance.reload();
  await expect(finance.getByText('Closed', { exact: true })).toBeVisible();
  await checkReflow(finance);
  await finance.setViewportSize({ width: 390, height: 844 });
  expect(
    (await new AxeBuilder({ page: finance }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await finance.screenshot({
    path: testInfo.outputPath('finance-390.png'),
    animations: 'disabled',
  });
  await patient.goto('/work/pharmacy');
  await expect(patient.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  for (const tab of [desk, clinician, cashier, patient, finance]) await tab.close();
});

test('dispatches transport and hands the discharged bed to housekeeping', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
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
  const dispatcher = await page.context().newPage();
  await signIn(dispatcher, 'transport');
  await expect(
    dispatcher.getByRole('heading', { name: 'Ambulance & Patient Transport' }),
  ).toBeVisible();
  const trigger = dispatcher.getByRole('button', { name: 'Request transport' });
  const tripEditor = dispatcher.getByRole('dialog', { name: 'Request transport' });
  await trigger.focus();
  await dispatcher.keyboard.press('Enter');
  await expect(tripEditor).toBeVisible();
  await dispatcher.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await tripEditor.getByLabel('Find admitted patient').fill(id);
  await tripEditor.getByLabel('Admission', { exact: true }).selectOption({ index: 1 });
  await tripEditor.getByLabel('Transport type').selectOption('Ambulance transfer');
  await tripEditor.getByLabel('Destination', { exact: true }).selectOption('External facility');
  await tripEditor.getByRole('button', { name: 'Add transport request' }).click();
  const trip = dispatcher.getByRole('row', { name: new RegExp(id) });
  await trip.getByRole('button', { name: 'Dispatch', exact: true }).click();
  await dispatcher.getByLabel('Available unit').selectOption({ label: 'Ambulance 1' });
  await dispatcher.getByRole('button', { name: 'Confirm dispatch' }).click();
  await expect(trip).toContainText('Dispatched');
  const units = dispatcher.getByRole('button', { name: 'Transport units' });
  const ambulance = dispatcher.getByRole('row', { name: /Ambulance 1/ });
  await units.click();
  await expect(ambulance).toContainText('Assigned');
  await dispatcher.getByRole('button', { name: 'Dispatch queue' }).click();
  await trip.getByRole('button', { name: 'Record pickup' }).click();
  await dispatcher.getByRole('button', { name: 'Confirm pickup' }).click();
  await expect(trip).toContainText('In transit');
  await dispatcher.reload();
  await expect(trip).toContainText('In transit');
  await checkReflow(dispatcher);
  expect(
    (
      await new AxeBuilder({ page: dispatcher })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await dispatcher.screenshot({
    path: testInfo.outputPath('transport-1440.png'),
    animations: 'disabled',
  });
  await row.getByRole('button', { name: 'Discharge' }).click();
  await page.getByRole('button', { name: 'Confirm discharge' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText(
    'Finish the active transport handoff before moving or discharging this admission.',
  );
  await dispatcher.getByRole('button', { name: 'Complete handoff' }).click();
  await dispatcher.getByRole('button', { name: 'Confirm handoff' }).click();
  await dispatcher.getByRole('button', { name: 'Trip history' }).click();
  await expect(trip).toContainText('Completed');
  await units.click();
  await expect(ambulance).toContainText('Available');
  const support = await page.context().newPage();
  await signIn(support, 'support');
  await support.getByRole('searchbox', { name: 'Find support task' }).fill(bed);
  const cleaning = support.getByRole('row', { name: new RegExp('Bed ' + bed) });
  await expect(cleaning).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirm discharge' }).click();
  await expect(row).toContainText('Discharged');
  await page.getByRole('button', { name: 'Bed board' }).click();
  await page.getByLabel('Filter by bed status').selectOption('Cleaning');
  const release = page.getByRole('button', { name: 'Release bed ' + bed });
  await expect(release).toBeVisible();
  await cleaning.getByRole('button', { name: 'Start task' }).click();
  await support.getByRole('button', { name: 'Confirm start' }).click();
  await expect(cleaning).toContainText('In progress');
  await cleaning.getByRole('button', { name: 'Mark bed ready' }).click();
  await support.getByRole('button', { name: 'Confirm completion' }).click();
  await expect(support.getByText('Bed available for allocation.')).toBeVisible();
  await expect(release).toHaveCount(0);
  await page.getByLabel('Filter by bed status').selectOption('Available');
  await expect(
    page
      .locator('.bed-card')
      .filter({ has: page.getByRole('heading', { name: bed, exact: true }) }),
  ).toContainText('Available');
  await support.getByRole('button', { name: 'Task history' }).click();
  await expect(cleaning).toContainText('Completed');
  await dispatcher.close();
  await support.close();
});

test('queues CSSD and dietary requests and persists the work states', async ({
  page,
}, testInfo) => {
  await signIn(page, 'support');
  const request = page.getByRole('button', { name: 'Request support' });
  const editor = page.getByRole('dialog', { name: 'Request support' });
  await request.focus();
  await page.keyboard.press('Enter');
  await expect(editor).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(request).toBeFocused();
  async function submit(service: string, work: string) {
    await request.click();
    await editor.getByLabel('Support service').selectOption(service);
    await editor.getByLabel('Ward', { exact: true }).selectOption({ index: 1 });
    await editor.getByLabel('Request type').selectOption(work);
    await editor.getByRole('button', { name: 'Add to work queue' }).click();
  }
  await submit('CSSD', 'Sterile set delivery');
  const sterile = page.getByRole('row', { name: /Sterile set delivery/ });
  await expect(sterile).toContainText('Queued');
  await submit('Dietary', 'Meal trolley delivery');
  const dietary = page.getByRole('row', { name: /Meal trolley delivery/ });
  await dietary.getByRole('button', { name: 'Cancel request' }).click();
  await page.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(dietary).toHaveCount(0);
  await sterile.getByRole('button', { name: 'Start task' }).click();
  await page.getByRole('button', { name: 'Confirm start' }).click();
  await page.reload();
  await page.getByRole('combobox', { name: 'Service', exact: true }).selectOption('CSSD');
  await expect(sterile).toContainText('In progress');
  await checkReflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('hospital-support-390.png'),
    animations: 'disabled',
  });
  await sterile.getByRole('button', { name: 'Complete task' }).click();
  await page.getByRole('button', { name: 'Confirm completion' }).click();
  await page.getByRole('button', { name: 'Task history' }).click();
  await expect(sterile).toContainText('Completed');
  await expect(dietary).toContainText('Cancelled');
  await page.goto('/work/patient-transport');
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
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
