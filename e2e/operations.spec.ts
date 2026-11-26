import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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

test('platform provisions organizations and facilities and revokes an active bed workspace', async ({
  page,
}, testInfo) => {
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
  await page
    .getByRole('row', { name: /Meridian Medical Centre/ })
    .getByRole('button', { name: 'Edit entitlement' })
    .click();
  const editor = page.getByRole('dialog', { name: 'Edit inpatient entitlement' });
  await editor.getByLabel('Inpatient operations').selectOption('false');
  await editor.getByRole('button', { name: 'Save entitlement' }).click();
  await expect(page.getByText('Inpatient entitlement updated.', { exact: true })).toBeVisible();
  await expect(staff.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
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
