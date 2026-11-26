import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'tc-brand',
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="brand"
    ><span class="brand-mark"><ng-icon name="heart" /></span><span>TrueCare</span></span
  >`,
})
export class Brand {}
