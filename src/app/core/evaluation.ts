import type { HttpInterceptorFn } from '@angular/common/http';

export const evaluationAvailable = false;
export const hostedDemoPassword: string | null = null;
export const evaluationInterceptor: HttpInterceptorFn = (request, next) => next(request);
