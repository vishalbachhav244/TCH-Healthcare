import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch(() => {
  const root = document.querySelector('app-root');
  if (root) root.textContent = 'TrueCare could not start. Reload this page to try again.';
});
