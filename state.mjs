export const LIMIT = 25;
export const HISTORY_LIMIT = 30;
export const groups = {
  light: ['bright', 'contrast', 'exposure', 'highlights', 'shadows'],
  color: ['temperature', 'tint', 'sat', 'vibrance'],
  detail: ['sharp', 'blur'],
};
export const ranges = {
  bright: ['Kecerahan', 'Brightness', -100, 100, 0],
  contrast: ['Kontras', 'Contrast', -100, 100, 0],
  exposure: ['Dedahan', 'Exposure', -100, 100, 0],
  highlights: ['Sorotan', 'Highlights', -100, 100, 0],
  shadows: ['Bayang', 'Shadows', -100, 100, 0],
  temperature: ['Suhu warna', 'Temperature', -100, 100, 0],
  tint: ['Tint', 'Tint', -100, 100, 0],
  sat: ['Ketepuan', 'Saturation', -100, 100, 0],
  vibrance: ['Kepekatan warna', 'Vibrance', -100, 100, 0],
  sharp: ['Ketajaman', 'Sharpening', 0, 100, 0],
  blur: ['Kabur', 'Blur', 0, 20, 0],
  zoom: ['Zum', 'Zoom', 100, 400, 100],
  panX: ['Anjakan mendatar', 'Horizontal position', -100, 100, 0],
  panY: ['Anjakan menegak', 'Vertical position', -100, 100, 0],
  straight: ['Luruskan', 'Straighten', -30, 30, 0],
  guide: ['Penanda bahagian atas kepala (%)', 'Top-of-head marker (%)', 0, 50, 12],
  brush: ['Saiz berus', 'Brush size', 1, 25, 5],
  feather: ['Kelembutan tepi', 'Edge softness', 0, 100, 35],
};
export const adjustmentKeys = Object.values(groups).flat();
export const defaults = Object.fromEntries(Object.entries(ranges).map(([key, range]) => [key, range[4]]));
export const profiles = {
  general: ['Kegunaan Umum', 'General Use'],
  id: ['Gambar Kad Pengenalan', 'ID Photo'],
  passport: ['Passport Antarabangsa', 'International Passport'],
};

export function migrateProfile(profile, channel) {
  const key = String(profile ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['1', 'id', 'idphoto', 'my', 'mymalaysiamyonlinepasport', 'malaysiamyonlinepasport', 'malaysiamyonlinepassport', 'mymyonlinepasport', 'myonlinepasport', 'myonlinepassport', 'malaysiapassport'].includes(key)) {
    return { profile: 'id', channel: 'my' };
  }
  if (['2', 'passport', 'internationalpassport', 'uk', 'ukdigital', 'ukpassportdigital', 'unitedkingdompassportdigital', 'unitedkingdomdigital'].includes(key)) {
    return { profile: 'passport', channel: key === 'passport' || key === 'internationalpassport' ? (channel === 'uk' ? 'uk' : 'my') : 'uk' };
  }
  return { profile: 'general', channel: 'my' };
}

export function makeEdit(old = {}) {
  const values = { ...defaults };
  for (const [key, value] of Object.entries(old.values ?? {})) {
    if (Object.hasOwn(ranges, key) && typeof value === 'number' && Number.isFinite(value)) {
      values[key] = Math.max(ranges[key][2], Math.min(ranges[key][3], value));
    }
  }
  const ratio = ['original', '1:1', '4:5', '7:10', '3:2', 'custom'].includes(old.ratio) ? old.ratio : 'original';
  return {
    values, ratio,
    rotation: Number.isFinite(old.rotation) ? old.rotation % 360 : 0,
    mask: old.mask instanceof Blob ? old.mask : null,
    strokes: Array.isArray(old.strokes) ? old.strokes : [],
    background: ['transparent', 'white', 'blue', 'gray'].includes(old.background) ? old.background : 'transparent',
    width: parseDimension(old.width), height: parseDimension(old.height),
    ...migrateProfile(old.profile, old.channel),
  };
}

export function parseDimension(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 6000 ? parsed : 0;
}

export function snapshot(edit) {
  return { ...edit, values: { ...edit.values } };
}

export function record(photo, previous = snapshot(photo.edit)) {
  photo.past.push(previous);
  if (photo.past.length > HISTORY_LIMIT) photo.past.shift();
  photo.future = [];
}

export function travel(photo, direction) {
  const [from, to] = direction === 'undo' ? [photo.past, photo.future] : [photo.future, photo.past];
  if (!from.length) return false;
  to.push(snapshot(photo.edit));
  photo.edit = from.pop();
  return true;
}

export function copyAdjustments(source, target, chosen) {
  for (const group of chosen) {
    for (const key of groups[group] ?? []) target.values[key] = source.values[key];
  }
}

export function makePreset(name, edit, includeStyle) {
  const values = Object.fromEntries(adjustmentKeys.map(key => [key, edit.values[key]]));
  return { version: 1, name, values, ...(includeStyle && {
    style: { profile: edit.profile, channel: edit.channel, background: edit.background },
  }) };
}

export function applyPreset(edit, preset) {
  const settings = makeEdit({ values: preset.values, ...preset.style });
  for (const key of adjustmentKeys) edit.values[key] = settings.values[key];
  if (preset.style) {
    edit.profile = settings.profile;
    edit.channel = settings.channel;
    edit.background = settings.background;
  }
}

export function channelFor(photo) {
  return photo.edit.profile === 'passport' ? photo.edit.channel : '';
}
