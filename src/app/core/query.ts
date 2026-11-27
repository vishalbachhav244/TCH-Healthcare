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
  affected: (id: string, params: P) => boolean = (id, params) => id === params.facility,
) {
  return refreshingQuery(
    params,
    (value) => !!value.facility && !!value.token,
    (value) => facilityChanges.pipe(filter((id) => affected(id, value))),
    request,
  );
}

export function refreshingQuery<T, P>(
  params: Signal<P>,
  enabled: (params: P) => boolean,
  changes: (params: P) => Observable<unknown>,
  request: (params: P) => Observable<T>,
) {
  return toSignal(
    toObservable(params).pipe(
      switchMap((value) => {
        if (!enabled(value)) return of<QueryState<T>>({ state: 'loading' });
        return merge(of(null), changes(value)).pipe(
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
