import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, filter, interval, map, merge, of, switchMap } from 'rxjs';
import { Api, errorMessage } from '../core/api';
import { evaluationAvailable } from '../core/evaluation';
import { facilityChanges } from '../core/events';
import type { QueryState } from '../core/query';
import { Brand } from '../design-system/brand';
import type { QueueDisplayData } from '../domain/operations';

@Component({
  imports: [Brand, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <main class="queue-display">
    <div class="display-header">
      <tc-brand /><a class="button secondary" routerLink="/">Return to TrueCare</a>
    </div>
    @let screen = data();
    @if (screen.state === 'ready') {
      <p class="eyebrow"><span></span> {{ screen.data.facility }}</p>
      <h1>Now calling</h1>
      <div class="display-grid" aria-live="polite">
        @for (token of screen.data.calling; track token.number) {
          <article class="panel display-token">
            <span>Token</span><strong>{{ token.number }}</strong>
            <h2>{{ token.specialty }}</h2>
          </article>
        } @empty {
          <p>No tokens are currently being called.</p>
        }
      </div>
      <p class="subtle">{{ screen.data.waiting }} waiting</p>
    } @else if (screen.state === 'error') {
      <h1>Queue display unavailable</h1>
      <p role="alert">{{ screen.message }}</p>
    } @else {
      <p role="status">Loading queue display…</p>
    }
  </main>`,
})
export class QueueDisplay {
  private readonly api = inject(Api);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('facility') ?? '';
  private readonly feed = evaluationAvailable
    ? merge(of(0), interval(60_000), facilityChanges.pipe(filter((id) => id === this.id))).pipe(
        switchMap(() =>
          this.api.queueDisplay(this.id).pipe(
            map((data): QueryState<QueueDisplayData> => ({ state: 'ready', data })),
            catchError((error: unknown) =>
              of<QueryState<QueueDisplayData>>({ state: 'error', message: errorMessage(error) }),
            ),
          ),
        ),
      )
    : of<QueryState<QueueDisplayData>>({
        state: 'error',
        message: 'There is no active service at this address.',
      });
  protected readonly data = toSignal(this.feed, {
    initialValue: { state: 'loading' } as QueryState<QueueDisplayData>,
  });
}
