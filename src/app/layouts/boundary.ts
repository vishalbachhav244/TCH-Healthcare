import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Brand } from '../design-system/brand';

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
      <a class="button primary" routerLink="/">Return to workspace</a>
    }
  </main>`,
})
export class Boundary {
  protected readonly unavailable = inject(ActivatedRoute).snapshot.data['unavailable'] === true;
}
