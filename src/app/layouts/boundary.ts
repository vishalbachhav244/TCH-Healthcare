import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Brand } from '../design-system/brand';
import { SessionStore } from '../core/session';

@Component({
  imports: [Brand, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<main class="boundary">
    <tc-brand />
    <h1>{{ unavailable ? 'Workspace unavailable' : 'Access restricted' }}</h1>
    <p>
      {{
        unavailable
          ? 'There is no active service at this address.'
          : 'Your account does not have access to this workspace at the selected facility.'
      }}
    </p>
    @if (!unavailable) {
      @if (store.home() !== '/denied') {
        <a class="button primary" routerLink="/">Return to workspace</a>
      }
      <button class="button secondary" type="button" (click)="switchAccount()">
        Switch account
      </button>
    }
  </main>`,
})
export class Boundary {
  protected readonly store = inject(SessionStore);
  private readonly router = inject(Router);
  protected readonly unavailable = inject(ActivatedRoute).snapshot.data['unavailable'] === true;

  protected async switchAccount() {
    await this.store.signOut();
    await this.router.navigateByUrl('/sign-in');
  }
}
