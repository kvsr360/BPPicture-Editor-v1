export function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Encoding failed.')), type, quality);
  });
}

const canRetryFacing = error => ['OverconstrainedError', 'NotFoundError'].includes(error.name);

export class Camera {
  #request = 0;
  #stream = null;
  #video = null;
  #constraints = Promise.resolve();
  facing = 'environment';
  canSwitch = false;

  constructor(onEnded, mediaDevices = globalThis.navigator?.mediaDevices) {
    this.onEnded = onEnded;
    this.devices = mediaDevices;
  }

  get track() {
    return this.#stream?.getVideoTracks()[0];
  }

  get live() {
    return this.track?.readyState === 'live';
  }

  stop() {
    this.#request += 1;
    this.#stream?.getTracks().forEach(track => track.stop());
    this.#stream = null;
    this.attach(null);
  }

  async start(facing = this.facing, exact = false) {
    this.stop();
    const request = this.#request;
    if (!this.devices?.getUserMedia) throw new DOMException('Open the app over HTTPS.', 'SecurityError');
    const video = { facingMode: exact ? { exact: facing } : { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } };
    let stream;
    try {
      stream = await this.devices.getUserMedia({ audio: false, video });
    } catch (error) {
      if (request !== this.#request) return false;
      if (exact || !canRetryFacing(error)) throw error;
      try {
        stream = await this.devices.getUserMedia({ audio: false, video: true });
      } catch (retryError) {
        if (request !== this.#request) return false;
        throw retryError;
      }
    }
    if (request !== this.#request) {
      stream.getTracks().forEach(track => track.stop());
      return false;
    }
    this.#stream = stream;
    const track = this.track;
    if (!track || track.readyState !== 'live') {
      this.stop();
      throw new DOMException('No live video track.', 'NotReadableError');
    }
    this.facing = track.getSettings?.().facingMode ?? facing;
    this.canSwitch = false;
    track.addEventListener('ended', () => {
      if (this.track !== track) return;
      this.stop();
      this.onEnded();
    }, { once: true });
    return true;
  }

  async detectSwitch() {
    const track = this.track;
    if (!track) return false;
    let devices = [];
    try {
      devices = await this.devices.enumerateDevices?.() ?? [];
    } catch {
      // Some browsers expose facing modes without exposing the device list.
    }
    if (this.track !== track) return false;
    const modes = track.getCapabilities?.().facingMode ?? [];
    this.canSwitch = modes.includes('user') && modes.includes('environment') ||
      devices.filter(device => device.kind === 'videoinput').length > 1;
    return this.canSwitch;
  }

  attach(video) {
    if (this.#video !== video) {
      if (this.#video) this.#video.srcObject = null;
      this.#video = video;
    }
    if (!video || !this.live) return;
    video.muted = true;
    video.playsInline = true;
    video.classList.toggle('mirror', this.facing === 'user');
    if (video.srcObject !== this.#stream) video.srcObject = this.#stream;
    if (!video.paused) return;
    video.play().catch(() => {
      if (this.#video === video && this.live && video.paused) this.onEnded('playback');
    });
  }

  control(name) {
    const track = this.track;
    const capability = track?.getCapabilities?.()[name];
    if (!capability || !Number.isFinite(capability.min) || !Number.isFinite(capability.max) || capability.min >= capability.max) return null;
    return { ...capability, value: track.getSettings?.()[name] ?? Math.min(capability.max, Math.max(capability.min, name === 'zoom' ? 1 : 0)) };
  }

  setControl(name, value) {
    const track = this.track;
    if (!track || !this.control(name)) return Promise.reject(new Error('Camera control unavailable.'));
    const operation = this.#constraints.then(async () => {
      if (track !== this.track) return;
      await track.applyConstraints({ advanced: [{ [name]: value }] });
      const actual = track.getSettings?.()[name];
      const step = this.control(name)?.step ?? 0.02;
      if (Number.isFinite(actual) && Math.abs(actual - value) > Math.max(step / 2, 0.02)) {
        throw new Error('Camera did not apply the setting.');
      }
    });
    this.#constraints = operation.catch(() => {});
    return operation;
  }

  async capture() {
    const video = this.#video;
    if (!this.live || !video?.videoWidth || video.readyState < 2) throw new Error('Camera frame is not ready.');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    // The mirrored selfie effect is CSS on the preview only.
    canvas.getContext('2d').drawImage(video, 0, 0);
    try {
      return await canvasBlob(canvas, 'image/jpeg', 0.95);
    } finally {
      canvas.width = canvas.height = 1;
    }
  }
}
