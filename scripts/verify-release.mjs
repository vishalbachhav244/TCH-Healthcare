import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from '@playwright/test';

const inactive = 'dist/truecare/browser';
const evaluation = 'dist/evaluation/browser';
const scripts = (await readdir(inactive)).filter((name) => name.endsWith('.js'));
const code = await Promise.all(scripts.map((name) => readFile(join(inactive, name), 'utf8')));
assert(
  !code.some((source) => /TrueCare-Local-2026|truecare-evaluation-v1/.test(source)),
  'The inactive build includes evaluation authentication or persistence',
);
assert(!(await readdir(inactive)).includes('ngsw-worker.js'));
const worker = JSON.parse(await readFile(join(evaluation, 'ngsw.json'), 'utf8'));
assert.equal(worker.dataGroups.length, 0);
assert(worker.assetGroups.length > 0);

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
  const page = await browser.newPage();
  for (const route of ['/', '/sign-in', '/work/overview', '/display/mer-central']) {
    await page.goto('http://127.0.0.1:' + server.address().port + route);
    await page.getByRole('heading', { name: /(?:Workspace|Queue display) unavailable/ }).waitFor();
  }
  // Fulfil requests from local build files so the non-loopback check stays offline.
  await page.route('http://truecare.invalid/**', async (route) => {
    const { asset, contentType } = browserAsset(route.request().url());
    try {
      await route.fulfill({ status: 200, path: join(evaluation, asset), contentType });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
  await page.goto('http://truecare.invalid/');
  await page.getByRole('heading', { name: 'Workspace unavailable' }).waitFor();
  console.log('Verified inactive release routes and evaluation host restrictions.');
} finally {
  await browser?.close();
  server.close();
}
