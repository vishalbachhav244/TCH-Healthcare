import { HttpErrorResponse, HttpResponse, type HttpInterceptorFn } from '@angular/common/http';
import { catchError, defer, map, throwError } from 'rxjs';

export function createEvaluationInterceptor(available: boolean): HttpInterceptorFn {
  return (request, next) => {
    if (!request.url.startsWith('/api/v1/')) return next(request);
    if (!available)
      return throwError(
        () =>
          new HttpErrorResponse({
            status: 503,
            error: { message: 'This access boundary is unavailable.' },
          }),
      );
    return defer(async () => {
      const { handle } = await import('../mocks/rest');
      return handle(request);
    }).pipe(
      map(
        (body) =>
          new HttpResponse({
            status: request.method === 'POST' ? 201 : 200,
            body,
            url: request.url,
          }),
      ),
      catchError((error: unknown) => {
        const response =
          error instanceof Error && 'status' in error && typeof error.status === 'number'
            ? { status: error.status, error: { message: error.message } }
            : { status: 503, error: { message: 'The workspace is unavailable. Try again.' } };
        return throwError(() => new HttpErrorResponse(response));
      }),
    );
  };
}
