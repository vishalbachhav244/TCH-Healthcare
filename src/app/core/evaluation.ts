import type { HttpInterceptorFn } from '@angular/common/http';

export const evaluationAvailable = false;
export const evaluationInterceptor: HttpInterceptorFn = (request, next) => next(request);
