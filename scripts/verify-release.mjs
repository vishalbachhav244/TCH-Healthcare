import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from '@playwright/test';

const inactive = 'dist/truecare/browser';
const evaluation = 'dist/evaluation/browser';
const hosted = 'dist/hosted-evaluation/browser';
const hostedOrigin = 'https://tch-healthcare-demo.pages.dev';
const scripts = (await readdir(inactive)).filter((name) => name.endsWith('.js'));
const code = await Promise.all(scripts.map((name) => readFile(join(inactive, name), 'utf8')));
assert(
  !code.some((source) =>
    /Pass@2027|TrueCare-Local-2026|truecare-evaluation-v1|H4K9-M7Q2-V6N3/.test(source),
  ),
  'The inactive build includes evaluation authentication or persistence',
);
assert(!(await readdir(inactive)).includes('ngsw-worker.js'));
for (const directory of [evaluation, hosted]) {
  const worker = JSON.parse(await readFile(join(directory, 'ngsw.json'), 'utf8'));
  assert.equal(worker.dataGroups.length, 0);
  assert(worker.assetGroups.length > 0);
}

const mime = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

function browserAsset(url) {
  const path = new URL(url, 'http://127.0.0.1').pathname;
  const extension = extname(path);
  return {
    asset: /^\/[\w.-]+(?:\/[\w.-]+)*$/.test(path) && extension ? path.slice(1) : 'index.html',
    contentType: mime[extension] ?? 'text/html',
  };
}

function serveBuild(page, origin, directory) {
  return page.route(`${origin}/**`, async (route) => {
    const { asset, contentType } = browserAsset(route.request().url());
    try {
      await route.fulfill({ status: 200, path: join(directory, asset), contentType });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
}

const server = createServer(async (request, response) => {
  const { asset, contentType } = browserAsset(request.url);
  try {
    const content = await readFile(join(inactive, asset));
    response.writeHead(200, { 'content-type': contentType }).end(content);
  } catch {
    if (!response.headersSent) response.writeHead(404);
    response.end();
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ serviceWorkers: 'block' });
  for (const route of [
    '/',
    '/sign-in',
    '/register',
    '/work/overview',
    '/display/mer-central',
    '/find-care',
    '/kiosk/mer-central',
  ]) {
    await page.goto('http://127.0.0.1:' + server.address().port + route);
    await page.getByRole('heading', { name: /(?:Workspace|Queue display) unavailable/ }).waitFor();
  }
  // Fulfil requests from local build files so the non-loopback check stays offline.
  await serveBuild(page, 'http://truecare.invalid', evaluation);
  await page.goto('http://truecare.invalid/');
  await page.getByRole('heading', { name: 'Workspace unavailable' }).waitFor();
  for (const route of ['/find-care', '/kiosk/mer-central', '/register']) {
    await page.goto('http://truecare.invalid' + route);
    await page.getByRole('heading', { name: 'Workspace unavailable' }).waitFor();
  }

  const otherOrigin = 'https://preview.tch-healthcare-demo.pages.dev';
  await serveBuild(page, otherOrigin, hosted);
  await page.goto(`${otherOrigin}/sign-in`);
  await page.getByRole('heading', { name: 'Workspace unavailable' }).waitFor();

  await serveBuild(page, hostedOrigin, hosted);
  await page.goto(`${hostedOrigin}/find-care`);
  await page.getByRole('heading', { name: 'Find care', exact: true }).waitFor();
  await page.goto(`${hostedOrigin}/sign-in`);
  await page.getByText('Pass@2027', { exact: true }).waitFor();
  await page.getByLabel('Account ID').fill('patient');
  await page.getByLabel('Password', { exact: true }).fill('TrueCare-Local-2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('alert').waitFor();
  await page.getByLabel('Password', { exact: true }).fill('Pass@2027');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(`${hostedOrigin}/work/portal`);
  await page.reload();
  await page.getByRole('heading', { name: 'My care', exact: true }).waitFor();
  await page.goto(`${hostedOrigin}/work/platform`);
  await page.waitForURL(`${hostedOrigin}/denied`);
  console.log('Verified inactive release, evaluation origin restrictions and hosted sign-in.');
} finally {
  await browser?.close();
  server.close();
}
