import { canvasBlob } from './camera.mjs';
import { adjustmentKeys } from './state.mjs';

const clamp = (number, min = 0, max = 1) => Math.min(max, Math.max(min, number));
export const MAX_EXPORT_PIXELS = 24_000_000;
const backgroundColors = { white: '#fff', blue: '#bad8fb', gray: '#e1e2e7' };

export function canvasAt(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export async function decode(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      // The browser's native image decoder may accept additional formats.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function thumbnail(blob) {
  const source = await decode(blob);
  const { width, height } = source;
  const factor = Math.min(1, 160 / Math.max(width, height));
  const small = canvasAt(width * factor, height * factor);
  try {
    small.getContext('2d').drawImage(source, 0, 0, small.width, small.height);
    return { width, height, thumbnail: await canvasBlob(small, 'image/webp', 0.8) };
  } finally {
    source.close?.();
  }
}

export function outputSize(width, height, edit, original = false) {
  if (original) return [width, height];
  if (Math.abs(edit.rotation) % 180 === 90) [width, height] = [height, width];
  if (edit.ratio !== 'original') {
    const [w, h] = edit.ratio === 'custom' ? [edit.width || width, edit.height || height] : edit.ratio.split(':').map(Number);
    const ratio = w / h;
    if (width / height > ratio) width = height * ratio;
    else height = width / ratio;
  }
  const ratio = width / height;
  if (edit.width && edit.height) {
    const scale = Math.min(edit.width / width, edit.height / height);
    return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
  }
  if (edit.width) return [edit.width, Math.max(1, Math.round(edit.width / ratio))];
  if (edit.height) return [Math.max(1, Math.round(edit.height * ratio)), edit.height];
  return [Math.max(1, Math.round(width)), Math.max(1, Math.round(height))];
}

export function geometry(sw, sh, w, h, edit) {
  const { values } = edit;
  const angle = (edit.rotation + values.straight) * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const c = Math.abs(cos), s = Math.abs(sin);
  const needX = w * c + h * s, needY = w * s + h * c;
  const scale = Math.max(needX / sw, needY / sh) * values.zoom / 100;
  const x = Math.max(0, (sw * scale - needX) / 2) * values.panX / 100;
  const y = Math.max(0, (sh * scale - needY) / 2) * values.panY / 100;
  return { angle, scale, x: w / 2 + x * cos - y * sin, y: h / 2 + x * sin + y * cos };
}

export function sourcePoint(x, y, sw, sh, w, h, edit) {
  const g = geometry(sw, sh, w, h, edit);
  const cos = Math.cos(g.angle), sin = Math.sin(g.angle);
  const dx = (x - g.x) / g.scale, dy = (y - g.y) / g.scale;
  return [clamp(0.5 + (dx * cos + dy * sin) / sw), clamp(0.5 + (dy * cos - dx * sin) / sh)];
}

function position(ctx, g) {
  ctx.translate(g.x, g.y);
  ctx.rotate(g.angle);
  ctx.scale(g.scale, g.scale);
}

function tone(ctx, width, height, v) {
  if (!adjustmentKeys.some(key => key !== 'blur' && v[key] !== 0)) return;
  const frame = ctx.getImageData(0, 0, width, height);
  const pixels = frame.data;
  const exposure = 2 ** (v.exposure / 55);
  const contrast = 2 ** (v.contrast / 85);
  const color = (v.temperature !== 0 || v.tint !== 0 || v.sat !== 0 || v.vibrance !== 0);
  for (let i = 0; i < pixels.length; i += 4) {
    if (!pixels[i + 3]) continue;
    let r = pixels[i] / 255, g = pixels[i + 1] / 255, b = pixels[i + 2] / 255;
    const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const light = v.bright * 0.003 + (v.highlights * luminance ** 3 + v.shadows * (1 - luminance) ** 3) * 0.004;
    r = (r * exposure + light - 0.5) * contrast + 0.5;
    g = (g * exposure + light - 0.5) * contrast + 0.5;
    b = (b * exposure + light - 0.5) * contrast + 0.5;
    if (color) {
      r += v.temperature * 0.0015 + v.tint * 0.0005;
      g -= v.tint * 0.0012;
      b -= v.temperature * 0.0015 - v.tint * 0.0005;
      const gray = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const chroma = clamp(Math.max(r, g, b) - Math.min(r, g, b));
      const saturation = Math.max(0, 1 + v.sat / 100 + v.vibrance * (1 - chroma) / 120);
      r = gray + (r - gray) * saturation;
      g = gray + (g - gray) * saturation;
      b = gray + (b - gray) * saturation;
    }
    pixels[i] = r * 255;
    pixels[i + 1] = g * 255;
    pixels[i + 2] = b * 255;
  }
  if (v.sharp > 0 && width > 2 && height > 2) {
    const base = new Uint8ClampedArray(pixels);
    const stride = width * 4;
    const strength = v.sharp / 300;
    const radius = Math.max(1, Math.round(Math.min(width, height) / 800));
    const horizontal = radius * 4, vertical = radius * stride;
    for (let y = radius; y < height - radius; y++) {
      for (let x = radius; x < width - radius; x++) {
        const i = y * stride + x * 4;
        for (let c = i; c < i + 3; c++) {
          pixels[c] = base[c] + strength * (4 * base[c] - base[c - horizontal] - base[c + horizontal] - base[c - vertical] - base[c + vertical]);
        }
      }
    }
  }
  ctx.putImageData(frame, 0, 0);
}

function maskLayer(width, height, sw, sh, g, mask, strokes) {
  const canvas = canvasAt(width, height);
  const ctx = canvas.getContext('2d');
  ctx.save();
  position(ctx, g);
  ctx.translate(-sw / 2, -sh / 2);
  ctx.beginPath();
  ctx.rect(0, 0, sw, sh);
  ctx.clip();
  ctx.fillStyle = '#fff';
  if (mask) ctx.drawImage(mask, 0, 0, sw, sh);
  else ctx.fillRect(0, 0, sw, sh);
  for (const stroke of strokes) {
    const radius = stroke.size * Math.min(sw, sh) / 200;
    const inner = radius * (1 - stroke.feather / 100);
    ctx.globalCompositeOperation = stroke.mode === 'restore' ? 'source-over' : 'destination-out';
    for (const [x, y] of stroke.points) {
      const px = x * sw, py = y * sh;
      if (inner === radius) ctx.fillStyle = '#fff';
      else {
        const fade = ctx.createRadialGradient(px, py, inner, px, py, radius);
        fade.addColorStop(0, '#fff');
        fade.addColorStop(1, '#fff0');
        ctx.fillStyle = fade;
      }
      ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
    }
  }
  ctx.restore();
  return canvas;
}

export function renderImage(canvas, source, edit, { original = false, mask = null, overlay = false, jpeg = false, draft = null } = {}) {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, width, height);
  if (original) {
    ctx.drawImage(source, 0, 0, width, height);
    return;
  }
  const sw = source.width, sh = source.height;
  const g = geometry(sw, sh, width, height, edit);
  const blur = edit.values.blur * Math.min(width, height) / 1500;
  ctx.save();
  if ('filter' in ctx && blur) ctx.filter = 'blur(' + blur + 'px)';
  position(ctx, g);
  ctx.drawImage(source, -sw / 2, -sh / 2);
  ctx.restore();
  if (blur && !('filter' in ctx)) {
    const sample = canvasAt(width / (1 + blur), height / (1 + blur));
    sample.getContext('2d').drawImage(canvas, 0, 0, sample.width, sample.height);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sample, 0, 0, width, height);
    sample.width = sample.height = 1;
  }
  tone(ctx, width, height, edit.values);
  const strokes = draft ? [...edit.strokes, draft] : edit.strokes;
  const layer = mask || strokes.length ? maskLayer(width, height, sw, sh, g, mask, strokes) : null;
  if (layer && !overlay) {
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(layer, 0, 0);
  }
  if (layer && overlay) {
    const tint = canvasAt(width, height);
    const tinted = tint.getContext('2d');
    tinted.fillStyle = '#ad57e499';
    tinted.fillRect(0, 0, width, height);
    tinted.globalCompositeOperation = 'destination-out';
    tinted.drawImage(layer, 0, 0);
    ctx.drawImage(tint, 0, 0);
    tint.width = tint.height = 1;
  }
  const fill = backgroundColors[edit.background] ?? (jpeg ? '#fff' : null);
  if (fill) {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.globalCompositeOperation = 'source-over';
  if (layer) layer.width = layer.height = 1;
}

export async function renderExport(photo, type) {
  const [width, height] = outputSize(photo.width, photo.height, photo.edit);
  if (width * height > MAX_EXPORT_PIXELS || width > 12000 || height > 12000) throw new Error('OUTPUT_SIZE');
  const canvas = canvasAt(width, height);
  let source, mask;
  try {
    source = await decode(photo.blob);
    if (photo.edit.mask) mask = await decode(photo.edit.mask);
    renderImage(canvas, source, photo.edit, { mask, jpeg: type === 'image/jpeg' });
    return await canvasBlob(canvas, type, 0.95);
  } finally {
    source?.close?.();
    mask?.close?.();
    canvas.width = canvas.height = 1;
  }
}
