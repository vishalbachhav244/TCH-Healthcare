import { type Signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, filter, map, merge, of, startWith, switchMap, type Observable } from 'rxjs';
import { errorMessage } from './api';
import { facilityChanges } from './events';

export type QueryState<T> =
  | { state: 'loading' }
  | { state: 'ready'; data: T }
  | { state: 'error'; message: string };

export function facilityQuery<T, P extends { facility: string; token: string }>(
  params: Signal<P>,
  request: (params: P) => Observable<T>,
) {
  return toSignal(
    toObservable(params).pipe(
      switchMap((value) => {
        if (!value.facility || !value.token) return of<QueryState<T>>({ state: 'loading' });
        return merge(
          of(value.facility),
          facilityChanges.pipe(filter((id) => id === value.facility)),
        ).pipe(
          switchMap(() =>
            request(value).pipe(
              map((data): QueryState<T> => ({ state: 'ready', data })),
              startWith<QueryState<T>>({ state: 'loading' }),
              catchError((error: unknown) =>
                of<QueryState<T>>({ state: 'error', message: errorMessage(error) }),
              ),
            ),
          ),
        );
      }),
    ),
    { initialValue: { state: 'loading' } as QueryState<T> },
  );
}
