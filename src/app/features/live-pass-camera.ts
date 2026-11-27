import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { loadAppointmentPassDecoder } from '../core/qr-pass';

@Component({
  selector: 'tc-live-pass-camera',
  imports: [NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state() === 'idle') {
      <button
        #startButton
        class="button secondary"
        type="button"
        (click)="start()"
        [disabled]="!active()"
      >
        <ng-icon name="scan" /> Use camera
      </button>
    } @else {
      <div class="camera-controls">
        @switch (state()) {
          @case ('requesting') {
            <p role="status">Waiting for camera access…</p>
          }
          @case ('scanning') {
            <p role="status">Hold the appointment QR code inside the camera view.</p>
          }
        }
        <button #stopButton class="button secondary" type="button" (click)="cancel()">
          Stop camera
        </button>
      </div>
    }
    <video
      #preview
      [hidden]="state() !== 'scanning'"
      autoplay
      muted
      playsinline
      aria-label="Appointment pass camera preview"
    ></video>
    @if (message()) {
      <p role="status" class="field-error">{{ message() }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      justify-items: start;
      gap: 10px;
      min-width: 0;
    }
    .camera-controls {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    video {
      width: min(100%, 320px);
      border-radius: 8px;
      background: var(--background);
    }
  `,
})
export class LivePassCamera {
  readonly active = input(true);
  readonly detected = output<string>();
  private readonly injector = inject(Injector);
  private readonly preview = viewChild.required<ElementRef<HTMLVideoElement>>('preview');
  private readonly startButton = viewChild<ElementRef<HTMLButtonElement>>('startButton');
  private readonly stopButton = viewChild<ElementRef<HTMLButtonElement>>('stopButton');
  protected readonly state = signal<'idle' | 'requesting' | 'scanning'>('idle');
  protected readonly message = signal('');
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private stream?: MediaStream;
  private video?: HTMLVideoElement;

  constructor() {
    effect(() => {
      if (!this.active()) this.stop();
    });
    const hide = () => {
      if (document.hidden) this.stop();
    };
    document.addEventListener('visibilitychange', hide);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', hide);
      this.stop();
    });
  }

  protected async start() {
    if (!this.active() || this.state() !== 'idle') return;
    this.message.set('');
    if (!navigator.mediaDevices?.getUserMedia) {
      this.message.set('Camera access is unavailable. Scan a QR image or enter the pass code.');
      return;
    }
    this.state.set('requesting');
    const generation = ++this.generation;
    afterNextRender(
      () => {
        if (generation === this.generation) this.stopButton()?.nativeElement.focus();
      },
      { injector: this.injector },
    );
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      for (const track of stream.getVideoTracks()) {
        track.addEventListener(
          'ended',
          () => {
            if (this.stream === stream)
              this.cameraError('The camera stopped. Scan a QR image or enter the pass code.');
          },
          { once: true },
        );
      }
      const video = this.preview().nativeElement;
      this.video = video;
      video.srcObject = stream;
      this.state.set('scanning');
      const decode = await loadAppointmentPassDecoder();
      if (generation !== this.generation) return;
      await video.play();
      if (generation === this.generation) this.capture(video, decode);
    } catch (error) {
      if (generation !== this.generation) return;
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      this.cameraError(
        denied
          ? 'Camera access was denied. Scan a QR image or enter the pass code.'
          : 'The camera could not start. Scan a QR image or enter the pass code.',
      );
    }
  }

  stop() {
    this.generation++;
    clearTimeout(this.timer);
    const stream = this.stream;
    const video = this.video;
    this.stream = undefined;
    this.video = undefined;
    stream?.getTracks().forEach((track) => track.stop());
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    this.state.set('idle');
    this.message.set('');
  }

  protected cancel() {
    this.stop();
    afterNextRender(() => this.startButton()?.nativeElement.focus(), { injector: this.injector });
  }

  private capture(
    video: HTMLVideoElement,
    decode: Awaited<ReturnType<typeof loadAppointmentPassDecoder>>,
  ) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error();
    const until = performance.now() + 45_000;
    const scan = () => {
      if (performance.now() >= until) {
        this.cameraError(
          'The camera timed out. Try again, scan a QR image or enter the pass code.',
        );
        return;
      }
      if (
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth &&
        video.videoHeight
      ) {
        try {
          const ratio = Math.min(1, 640 / video.videoWidth, 480 / video.videoHeight);
          const width = Math.max(1, Math.round(video.videoWidth * ratio));
          const height = Math.max(1, Math.round(video.videoHeight * ratio));
          if (width !== canvas.width || height !== canvas.height) {
            canvas.width = width;
            canvas.height = height;
          }
          context.drawImage(video, 0, 0, width, height);
          const value = decode(context.getImageData(0, 0, width, height));
          if (value) {
            this.stop();
            this.detected.emit(value);
            return;
          }
        } catch {
          this.cameraError(
            'The camera preview is unavailable. Scan a QR image or enter the pass code.',
          );
          return;
        }
      }
      this.timer = setTimeout(scan, 140);
    };
    scan();
  }

  private cameraError(message: string) {
    this.cancel();
    this.message.set(message);
  }
}
