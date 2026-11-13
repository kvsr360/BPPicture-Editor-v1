import { channelFor } from './state.mjs';
import { renderExport } from './render.mjs';

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  return value;
});

export function crc32(data, previous = 0) {
  let value = previous ^ 0xffffffff;
  for (const byte of data) value = (value >>> 8) ^ crcTable[(value ^ byte) & 0xff];
  return (value ^ 0xffffffff) >>> 0;
}

async function checksum(blob) {
  const reader = blob.stream().getReader();
  let crc = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) return crc;
    crc = crc32(value, crc);
  }
}

function header(length, fields) {
  const view = new DataView(new ArrayBuffer(length));
  for (const [offset, size, value] of fields) {
    if (size === 4) view.setUint32(offset, value, true);
    else view.setUint16(offset, value, true);
  }
  return view.buffer;
}

export async function zip(entries) {
  const locals = [], central = [];
  let offset = 0, centralLength = 0;
  const encoder = new TextEncoder();
  for (const { name, blob } of entries) {
    const path = encoder.encode(name);
    const size = blob.size;
    if (offset + size + path.length + 30 >= 0xffffffff) throw new Error('ZIP_SIZE');
    const crc = await checksum(blob);
    locals.push(header(30, [[0, 4, 0x04034b50], [4, 2, 20], [6, 2, 0x800], [12, 2, 33], [14, 4, crc], [18, 4, size], [22, 4, size], [26, 2, path.length]]), path, blob);
    central.push(header(46, [[0, 4, 0x02014b50], [4, 2, 20], [6, 2, 20], [8, 2, 0x800], [14, 2, 33], [16, 4, crc], [20, 4, size], [24, 4, size], [28, 2, path.length], [42, 4, offset]]), path);
    offset += 30 + path.length + size;
    centralLength += 46 + path.length;
  }
  if (offset + centralLength + 22 > 0xffffffff) throw new Error('ZIP_SIZE');
  const count = entries.length;
  return new Blob([...locals, ...central, header(22, [[0, 4, 0x06054b50], [8, 2, count], [10, 2, count], [12, 4, centralLength], [16, 4, offset]])], { type: 'application/zip' });
}

export function sourceIssues(photo) {
  if (channelFor(photo) !== 'uk') return [];
  const issues = [];
  if (photo.width < 600 || photo.height < 750) issues.push('dimensions');
  if (photo.blob.size < 50_000 || photo.blob.size > 10_000_000) issues.push('bytes');
  return issues;
}

export function fileName(photo, kind, type) {
  const suppliedExt = photo.name.match(/\.([a-z0-9]{1,8})$/i)?.[1].toLowerCase();
  const ext = kind === 'original' ? suppliedExt || ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' }[photo.blob.type]) || 'img' :
    (type === 'image/png' ? 'png' : 'jpg');
  const stem = photo.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N} _-]+/gu, '-').trim().slice(0, 55) || 'foto';
  const label = kind === 'original' ? (photo.source === 'camera' ? 'camera-capture' : 'original') : 'edited';
  return stem + '-' + label + '-' + photo.id.slice(-8) + '.' + ext;
}

export async function makeOutput(photo, kind, type) {
  const blob = kind === 'original' ? photo.blob : await renderExport(photo, type);
  return { name: fileName(photo, kind, type), blob };
}

export function download({ name, blob }) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
