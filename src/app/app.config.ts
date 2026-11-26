import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { isDevMode, type ApplicationConfig } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { evaluationAvailable, evaluationInterceptor } from './core/evaluation';
import { icons } from './design-system/icons';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    provideHttpClient(withInterceptors([evaluationInterceptor])),
    provideIcons(icons),
    provideServiceWorker('ngsw-worker.js', {
      enabled: evaluationAvailable && !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
