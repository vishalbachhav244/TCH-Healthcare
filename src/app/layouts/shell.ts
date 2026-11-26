import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { NgIcon } from '@ng-icons/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { SessionStore } from '../core/session';
import { Brand } from '../design-system/brand';
import { navigation } from '../domain/workspaces';

@Component({
  imports: [Brand, CdkTrapFocus, NgIcon, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './shell.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  protected readonly store = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly current = computed(
    () =>
      this.store.entries().find((entry) =>
        this.currentUrl()
          .split(/[?#]/)[0]
          .endsWith('/' + entry.resource),
      )?.title ?? 'Workspace',
  );
  protected readonly initials = computed(() =>
    this.store
      .session()
      ?.name.split(' ')
      .filter((word) => word !== 'Dr.')
      .slice(0, 2)
      .map((word) => word[0])
      .join(''),
  );
  protected readonly menu = signal(false);
  protected readonly patientLayout = computed(() => this.store.initialRoute() === 'portal');
  private readonly menuToggle = viewChild<ElementRef<HTMLButtonElement>>('menuToggle');

  constructor() {
    effect(() => {
      if (!this.store.session()) {
        void this.router.navigateByUrl('/sign-in', { replaceUrl: true });
        return;
      }
      const path = this.currentUrl().split(/[?#]/)[0];
      const active = navigation.find((entry) => path === '/work/' + entry.resource);
      if (active && !this.store.allowed(active.resource)) {
        void this.router.navigateByUrl('/denied', { replaceUrl: true });
      }
    });
  }

  protected async signOut() {
    await this.store.signOut();
  }

  protected closeMenu() {
    if (!this.menu()) return;
    this.menu.set(false);
    this.menuToggle()?.nativeElement.focus();
  }
}
