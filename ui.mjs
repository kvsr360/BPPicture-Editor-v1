import { icon } from './icons.mjs';
import { LIMIT, ranges, groups, profiles, channelFor } from './state.mjs';
import { outputSize } from './render.mjs';
import { sourceIssues } from './export.mjs';

export const $ = id => document.getElementById(id);
export const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const button = (name, action, variant = '', symbol = '', disabled = false, extra = '') =>
  '<button type="button" class="btn ' + variant + '" data-act="' + action + '" ' + (disabled ? 'disabled ' : '') + extra + '>' + (symbol ? icon(symbol) : '') + esc(name) + '</button>';
export const iconButton = (name, action, symbol, disabled = false, extra = '') =>
  '<button type="button" class="icon-btn" data-act="' + action + '" aria-label="' + esc(name) + '" title="' + esc(name) + '" ' + (disabled ? 'disabled ' : '') + extra + '>' + icon(symbol) + '</button>';
export const note = (text, kind = '') => '<p class="note ' + kind + '">' + esc(text) + '</p>';
export const label = (s, k) => s.t(...ranges[k].slice(0, 2));
export const profileName = (s, key) => s.t(...profiles[key]);
const option = (value, text, selected, disabled = false) => '<option value="' + value + '"' + (selected ? ' selected' : '') + (disabled ? ' disabled' : '') + '>' + esc(text) + '</option>';
const selected = bool => 'aria-pressed="' + bool + '"';

export function slider(s, key, value, override) {
  const [ms, en, min, max] = ranges[key] ?? override;
  const step = override?.[4] ?? 1;
  return '<div class="range-row"><div class="range-head"><label for="r-' + key + '">' + s.t(ms, en) + '</label><output class="value" id="v-' + key + '" for="r-' + key + '">' + value + '</output></div><input id="r-' + key + '" data-range="' + key + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '"></div>';
}

function film(s, add = false, remove = false) {
  const { t, photos, active, selecting, chosen, busy, loading } = s;
  if (!photos.length && !add) return '';
  const items = photos.map((p, i) => {
    const name = t('Foto ', 'Photo ') + (i + 1) + ' · ' + p.name;
    return '<div class="film-item"><button type="button" class="thumb" data-act="photo-' + i + '" aria-label="' + esc(name) + '" ' + selected(selecting ? chosen.has(p.id) : i === active) + '><img src="' + esc(p.url) + '" alt=""><i>' + (selecting && chosen.has(p.id) ? '✓' : i + 1) + '</i></button>' +
      (remove ? iconButton(t('Alih keluar ', 'Remove ') + name, 'remove-' + i, 'close', busy || loading) : '') + '</div>';
  }).join('');
  return '<div class="film" aria-label="' + t('Foto dalam kelompok', 'Photos in batch') + '">' + items +
    (add ? '<button class="thumb add" data-act="pick" aria-label="' + t('Tambah foto', 'Add photos') + '">' + icon('plus') + '</button>' : '') + '</div>';
}

function studio(s) {
  const { t, current: p, screen, comparing, tab, overlay } = s;
  const editing = screen === 'edit';
  const showMask = editing && !comparing && tab === 'mask';
  const showGuides = editing && !comparing && tab === 'crop';
  const [w, h] = outputSize(p.width, p.height, p.edit, comparing);
  const controls = editing ? '<div class="group">' +
    iconButton(t('Buat asal', 'Undo'), 'undo', 'undo', !p.past.length) +
    iconButton(t('Buat semula', 'Redo'), 'redo', 'redo', !p.future.length) +
    '</div>' + button(comparing ? t('Foto Asal', 'Original') : t('Sebelum / Selepas', 'Before / After'), 'compare', 'quiet-btn', 'compare', false, selected(comparing)) :
    '<div class="group">' + icon('image') + '<strong>' + t(screen === 'pick' ? 'Kelompok Foto' : 'Pratonton', screen === 'pick' ? 'Photo Batch' : 'Preview') + '</strong></div><span class="badge">' + s.photos.length + '/' + LIMIT + '</span>';
  return '<section class="card studio"><div class="studio-top">' + controls + '</div><div class="canvas" data-mask="' + Boolean(!comparing && (p.edit.mask || p.edit.strokes.length)) + '"><div class="photo live-photo" data-interaction="' + (showMask ? 'mask' : showGuides ? 'crop' : '') + '" id="photo-frame" style="--ratio:' + w / h + ';--size:' + Math.min(1, w / h) + '"><canvas id="editor-canvas" role="img" aria-label="' + t('Pratonton foto', 'Photo preview') + '"></canvas>' +
    (showGuides ? '<span class="crop-guides" style="--guide:' + p.edit.values.guide + '%"></span>' : '') +
    '</div><span class="canvas-float">' + (comparing ? t('Asal', 'Original') : (showMask && overlay ? t('Topeng · ', 'Mask · ') : t('Foto ', 'Photo ')) + (s.active + 1) + ' / ' + s.photos.length) + '</span></div>' +
    film(s, editing, screen === 'pick') + '</section>';
}

function tile(name, detail, action, symbol, disabled) {
  return '<button class="btn tile" data-act="' + action + '" ' + (disabled ? 'disabled' : '') + '><span class="symbol">' + icon(symbol) + '</span><span><strong>' + esc(name) + '</strong><small>' + esc(detail) + '</small></span></button>';
}

function pick(s) {
  const { t, photos, busy, loading } = s;
  if (s.cameraOpen) return cameraPanel(s);
  const inactive = busy || loading || photos.length === LIMIT;
  const empty = '<section class="card empty"><span class="symbol">' + icon('image') + '</span><h2>' + t('Tiada Foto Lagi', 'No Photos Yet') + '</h2><p class="muted">' + t('Tambah foto daripada galeri atau ambil foto baharu.', 'Add a photo from your gallery or take a new one.') + '</p>' + button(t('Cuba Foto Contoh', 'Try Sample Photo'), 'sample', '', 'image', inactive) + '</section>';
  return '<div class="layout">' + (photos.length ? studio(s) : empty) +
    '<section class="card card-pad stack"><h2>' + t('Tambah Foto', 'Add Photos') + '</h2>' +
    tile(t('Muat Naik', 'Upload'), t('Pilih foto daripada peranti', 'Choose photos from your device'), 'upload', 'image', inactive) +
    tile(t('Kamera', 'Camera'), t('Ambil foto dalam aplikasi', 'Take photos in the app'), 'camera', 'camera', busy || loading) +
    (photos.length === LIMIT ? note(t('Had 25 foto dicapai. Alih keluar satu foto untuk menambah foto baharu.', '25-photo limit reached. Remove a photo to add another.'), 'alert') : '') + '</section></div>';
}

function cameraPanel(s) {
  const { t, camera, cameraPending, cameraMessage, cameraReady, photos, current: p, busy, retake } = s;
  const cameraRange = (key, ms, en) => {
    const control = camera.control(key);
    return control ? slider(s, 'camera-' + key, control.value, [ms, en, control.min, control.max, control.step || 0.01]) : '';
  };
  const zoom = cameraRange('zoom', 'Zum kamera', 'Camera zoom');
  const exposure = cameraRange('exposureCompensation', 'Pampasan dedahan kamera', 'Camera exposure compensation');
  const live = camera.live;
  const paused = !live && !cameraPending;
  const disabled = busy || !cameraReady || photos.length >= LIMIT && !retake;
  const status = cameraPending ? t('Menunggu kamera…', 'Waiting for camera…') :
    cameraMessage || (live ? t('Kamera aktif', 'Camera live') : t('Kamera dijeda', 'Camera paused'));
  return '<div class="layout"><section class="card studio"><div class="studio-top"><strong>' + t('Paparan Kamera', 'Camera View') + '</strong><span class="badge">' + photos.length + '/' + LIMIT + '</span></div><div class="canvas" data-camera="true"><div class="viewfinder"><video id="camera-video" autoplay muted playsinline aria-label="' + t('Siaran langsung kamera', 'Live camera feed') + '"></video>' +
    (live ? '<span class="crop-guides" style="--guide:12%"></span>' : '<span class="camera-placeholder">' + icon('camera') + '</span>') + '</div><span class="canvas-float" role="status">' + esc(status) + '</span></div>' + film(s, false, true) + '</section>' +
    '<section class="card card-pad stack camera-tools"><div class="card-head"><h2>' + t('Kawalan Kamera', 'Camera Controls') + '</h2>' + iconButton(t('Bantuan kamera', 'Camera help'), 'camera-help', 'help') + '</div>' +
    (live && (!zoom || !exposure) ? note(!zoom && !exposure ? t('Peranti atau pelayar ini tidak menyediakan zum dan pampasan dedahan.', 'This device or browser does not expose zoom or exposure compensation.') : (!zoom ? t('Zum kamera tidak tersedia.', 'Camera zoom is unavailable.') : t('Pampasan dedahan tidak tersedia.', 'Exposure compensation is unavailable.'))) : '') +
    zoom + exposure + '<div class="row camera-actions">' +
    (camera.canSwitch && live ? iconButton(t('Tukar kamera', 'Switch camera'), 'flip', 'rotate', busy || cameraPending) : '<span></span>') +
    '<button class="shutter" data-act="capture" aria-label="' + t('Tangkap foto', 'Take photo') + '" ' + (disabled ? 'disabled' : '') + '>' + icon('camera') + '</button>' +
    (p?.source === 'camera' || p?.source === 'native' ? iconButton(t('Alih keluar foto', 'Remove photo'), 'remove-' + s.active, 'trash', busy) : '<span></span>') + '</div>' +
    (retake ? note(t('Tangkapan seterusnya akan menggantikan foto yang dipilih.', 'The next capture will replace the selected photo.')) : '') +
    (photos.length === LIMIT && !retake ? note(t('Had 25 foto dicapai. Alih keluar satu foto atau ambil semula.', '25-photo limit reached. Remove a photo or retake one.'), 'alert') : '') +
    (p && ['camera', 'native'].includes(p.source) ? button(retake ? t('Batal Ambil Semula', 'Cancel Retake') : t('Ambil Semula', 'Retake'), 'retake', '', 'rotate', busy) : '') +
    (paused ? button(t('Hidupkan Kamera', 'Start Camera'), 'resume-camera', 'primary', 'camera', busy) : '') +
    button(t('Buka Kamera Telefon', 'Open Phone Camera'), 'native', '', 'camera', busy || photos.length === LIMIT && !retake) +
    (paused ? button(t('Pilih Daripada Galeri', 'Choose From Gallery'), 'upload', '', 'image', busy || photos.length === LIMIT) : '') +
    '</section></div>';
}

function settingGroups(s) {
  const { t, current: p } = s;
  return '<details class="sub" data-section="light" ' + (s.expanded.has('light') ? 'open' : '') + '><summary>' + t('Cahaya', 'Light') + '</summary><div class="stack">' + groups.light.map(k => slider(s, k, p.edit.values[k])).join('') + '</div></details>' +
    '<details class="sub" data-section="color" ' + (s.expanded.has('color') ? 'open' : '') + '><summary>' + t('Warna & Imbangan Putih', 'Colour & White Balance') + '</summary><div class="stack">' + groups.color.map(k => slider(s, k, p.edit.values[k])).join('') + '</div></details>' +
    '<details class="sub" data-section="detail" ' + (s.expanded.has('detail') ? 'open' : '') + '><summary>' + t('Ketajaman & Kabur', 'Sharpening & Blur') + '</summary><div class="stack">' + groups.detail.map(k => slider(s, k, p.edit.values[k])).join('') + '</div></details>' +
    button(t('Tetapkan Semula Larasan', 'Reset Adjustments'), 'reset');
}

function positionPanel(s) {
  const { t, current: p } = s;
  const { values, ratio, width, height } = p.edit;
  return '<div class="stack"><h3>' + t('Sunting dan Laras Kedudukan', 'Edit and Adjust Position') + '</h3><label class="field">' + t('Nisbah bingkai', 'Frame ratio') + '<select id="ratio">' +
    [['original', t('Asal', 'Original')], ['1:1', '1:1'], ['4:5', '4:5'], ['7:10', '7:10'], ['3:2', '3:2'], ['custom', t('Ikut dimensi sendiri', 'Custom dimensions')]].map(([key, text]) => option(key, text, ratio === key)).join('') + '</select></label>' +
    '<div class="dimension-fields">' + [['width', t('Lebar (px)', 'Width (px)'), width], ['height', t('Tinggi (px)', 'Height (px)'), height]].map(([key, name, value]) => '<label class="field">' + name + '<input type="number" min="1" max="6000" id="' + key + '" placeholder="' + t('Auto', 'Auto') + '" value="' + (value || '') + '"></label>').join('') + '</div>' +
    ['zoom', 'panX', 'panY', 'straight'].map(k => slider(s, k, values[k])).join('') +
    '<div class="guide-field">' + slider(s, 'guide', values.guide) + helpTip(t('Jarak penanda dari bahagian atas bingkai. Penanda hanya digunakan semasa menyunting.', 'Marker distance from the top of the frame. It is visible while editing.')) + '</div>' +
    '<div class="row">' + button(t('Putar 90°', 'Rotate 90°'), 'rotate', '', 'rotate') + button(t('Set Semula', 'Reset'), 'reset-position') + '</div></div>';
}

function backgroundPanel(s) {
  const { t, current: p, maskBusy, brushMode, overlay } = s;
  return '<div class="stack"><div class="card-head"><h3>' + t('Latar', 'Background') + '</h3>' + helpTip(t('Padam menyembunyikan piksel. Pulihkan mengembalikan piksel asal.', 'Erase hides pixels. Restore brings back source pixels.')) + '</div>' +
    button(maskBusy ? t('Memproses…', 'Processing…') : t('Buang Latar Automatik', 'Remove Background Automatically'), 'auto-mask', 'primary', 'mask', maskBusy) +
    '<div class="row">' + ['erase', 'restore', 'pan'].map((mode, i) => button([t('Padam', 'Erase'), t('Pulihkan', 'Restore'), t('Anjak', 'Pan')][i], mode, brushMode === mode ? 'on' : '', '', false, selected(brushMode === mode))).join('') + '</div>' +
    slider(s, 'zoom', p.edit.values.zoom) + slider(s, 'brush', p.edit.values.brush) + slider(s, 'feather', p.edit.values.feather) +
    '<label class="checkbox"><input type="checkbox" id="mask-overlay" ' + (overlay ? 'checked' : '') + '> ' + t('Paparkan topeng', 'Show mask overlay') + '</label>' +
    '<label class="field">' + t('Warna latar baharu', 'New background colour') + '<select id="background">' +
    [['transparent', t('Telus', 'Transparent')], ['white', t('Putih', 'White')], ['blue', t('Biru', 'Blue')], ['gray', t('Kelabu', 'Grey')]].map(([key, name]) => option(key, name, p.edit.background === key)).join('') + '</select></label>' +
    button(t('Set Semula Topeng', 'Reset Mask'), 'reset-mask', '', '', !p.edit.mask && !p.edit.strokes.length) + '</div>';
}

function presetPanel(s) {
  const { t, presets } = s;
  return '<div class="stack">' + (presets.length ? presets.map((preset, i) => '<div class="preset-row">' +
    button(preset.name, 'apply-preset-' + i, '', 'preset') + iconButton(t('Padam pratetap ', 'Delete preset ') + preset.name, 'delete-preset-' + i, 'trash') + '</div>').join('') :
    '<p class="muted">' + t('Belum ada pratetap tersimpan.', 'No saved presets yet.') + '</p>') + button(t('Simpan Pratetap', 'Save Preset'), 'save-preset', 'primary', 'preset') + '</div>';
}

export function helpTip(text) {
  return '<span class="tip"><button type="button" class="icon-btn" data-act="tip" aria-label="' + esc(text) + '" aria-expanded="false">' + icon('help') + '</button><span role="tooltip">' + esc(text) + '</span></span>';
}

function editor(s) {
  const { t, tab, collapsed } = s;
  const tabs = [['light', t('Larasan', 'Adjust'), 'sliders'], ['crop', t('Kedudukan', 'Position'), 'crop'], ['mask', t('Latar', 'Background'), 'mask'], ['preset', t('Pratetap', 'Presets'), 'preset']];
  const pane = { light: settingGroups, crop: positionPanel, mask: backgroundPanel, preset: presetPanel };
  return '<section class="card tool-panel ' + (collapsed ? 'collapsed' : '') + '"><div class="panel-head card-head"><h2>' + t('Alat Suntingan', 'Editing Tools') + '</h2>' +
    '<button class="quiet-btn tool-collapse" data-act="collapse" aria-expanded="' + !collapsed + '">' + (collapsed ? t('Buka', 'Open') : t('Tutup', 'Close')) + '</button></div>' +
    '<div class="tabs" aria-label="' + t('Kategori alat', 'Tool categories') + '">' + tabs.map(([id, text, symbol]) =>
      '<button class="tab" data-act="tab-' + id + '" ' + selected(tab === id) + '>' + icon(symbol) + esc(text) + '</button>').join('') + '</div>' +
    '<div class="controls stack tight">' + pane[tab](s) + '</div></section>';
}

export function profilePanel(s) {
  const { t, current: p } = s;
  return '<div class="stack">' + Object.keys(profiles).map(key => button(profileName(s, key), 'profile-' + key, 'choice', p.edit.profile === key ? 'check' : '', false, selected(p.edit.profile === key))).join('') +
    (p.edit.profile === 'passport' ? '<label class="field">' + t('Saluran permohonan', 'Application channel') + '<select id="channel">' + option('my', 'Malaysia · MyOnline Pasport', p.edit.channel === 'my') + option('uk', 'United Kingdom · Digital', p.edit.channel === 'uk') + '</select></label>' : '') +
    button(t('Selesai', 'Done'), 'close', 'primary', 'check') + '</div>';
}

function exportPanel(s) {
  const { t, current: p, scope, format, chosen, photos } = s;
  const [width, height] = outputSize(p.width, p.height, p.edit);
  const targets = scope === 'all' ? photos : scope === 'selected' ? photos.filter(photo => chosen.has(photo.id)) : [p];
  const channels = new Set(targets.map(channelFor));
  const captured = targets.some(photo => photo.source === 'camera');
  const issues = targets.filter(photo => sourceIssues(photo).length);
  const original = button(t('Muat Turun Foto Asal', 'Download Original Photo'), 'export-original', channels.has('uk') || channels.has('my') ? 'primary' : '', 'export');
  return '<section class="card card-pad stack"><h2>' + t('Tetapan Eksport', 'Export Settings') + '</h2><label class="field">' + t('Foto untuk disimpan', 'Photos to save') + '<select id="scope">' +
    option('one', t('Foto semasa', 'Current photo'), scope === 'one') + option('selected', t('Foto dipilih', 'Selected photos') + ' (' + chosen.size + ')', scope === 'selected', !chosen.size) + option('all', t('Semua foto', 'All photos') + ' (' + photos.length + ')', scope === 'all') +
    '</select></label><label class="field">' + t('Format foto suntingan', 'Edited photo format') + '<select id="format">' + option('image/jpeg', 'JPEG', format === 'image/jpeg') + option('image/png', 'PNG', format === 'image/png') + '</select></label>' +
    '<p class="muted small">' + width + ' × ' + height + ' px' + (targets.length > 1 ? ' · ZIP' : '') + '</p>' + original +
    (captured ? note(t('Tangkapan dalam aplikasi disimpan sebagai JPEG daripada bingkai kamera. Fail asal yang diimport boleh mengekalkan metadata.', 'In-app captures are saved as JPEGs from the camera frame. Imported original files may retain metadata.')) :
      '<p class="muted small">' + t('Fail asal boleh mengekalkan metadata.', 'Original files may retain metadata.') + '</p>') +
    (channels.has('my') ? note(t('MyOnline Pasport Malaysia menolak foto yang dijana atau diubah dengan AI. Gunakan foto asal terkini berlatar putih tanpa bayang.', 'Malaysia MyOnline Pasport rejects AI-generated or AI-modified photos. Use a recent original photo with a shadow-free white background.')) : '') +
    (channels.has('uk') ? note(t('UK Digital memerlukan foto tanpa suntingan. Biarkan perkhidmatan permohonan memangkas foto.', 'UK Digital requires an unaltered photo. Let the application service crop it.')) : '') +
    (issues.length ? note(t('Semakan UK Digital: ', 'UK Digital check: ') + issues.map(photo => photo.name + ' (' + sourceIssues(photo).map(key => key === 'dimensions' ? '600 × 750 px' : '50 KB–10 MB').join(', ') + ')').join('; '), 'alert') : '') +
    '</section>';
}

export function renderUI(s) {
  const { t, lang, screen, current: p, cameraOpen, photos, selecting, chosen, busy, loading, storageProblem } = s;
  document.documentElement.lang = lang;
  $('header-tools').innerHTML = '<div class="language" aria-label="' + t('Bahasa', 'Language') + '">' +
    ['ms', 'en'].map((key, i) => '<button type="button" data-act="lang-' + key + '" ' + selected(key === lang) + '>' + ['BM', 'EN'][i] + '</button>').join('') + '</div>' +
    iconButton(t('Panduan aplikasi', 'App guide'), 'help', 'help');
  const headings = {
    pick: cameraOpen ? [t('Kamera', 'Camera'), t('Bingkaikan foto dan semak hasil tangkapan.', 'Frame the photo and review your captures.')] :
      [t('Pilih Foto', 'Choose Photos'), t('Muat naik atau tangkap sehingga 25 foto.', 'Import or capture up to 25 photos.')],
    edit: [t('Sunting Foto', 'Edit Photos'), t('Laraskan satu foto atau salin tetapan ke beberapa foto.', 'Adjust one photo or copy settings across your batch.')],
    export: [t('Pratonton & Eksport', 'Preview & Export'), t('Semak hasil dan pilih foto untuk disimpan.', 'Review your edits and choose which photos to save.')],
  };
  const [title, description] = headings[screen];
  $('intro').innerHTML = '<div><h1>' + title + '</h1><p class="muted">' + description + '</p></div><span class="badge">' + icon('lock') + t('Pada peranti', 'On-device') + '</span>';
  $('steps').setAttribute('aria-label', t('Aliran kerja', 'Workflow'));
  $('steps').innerHTML = [['pick', t('Pilih Foto', 'Choose Photos'), 'image'], ['edit', t('Sunting Foto', 'Edit Photos'), 'sliders'], ['export', t('Eksport', 'Export'), 'export']].map(([id, name, symbol]) =>
    '<button class="step" data-act="' + id + '" ' + (screen === id ? 'aria-current="step"' : '') + (!p && id !== 'pick' || busy || loading ? ' disabled' : '') + '>' + icon(symbol) + name + '</button>').join('');
  const warning = storageProblem ? '<div class="storage-warning" role="alert">' + note(t('Perubahan belum disimpan pada peranti. Muat turun foto sebelum menutup aplikasi jika cubaan semula gagal.', 'Changes are not saved on this device. Download photos before closing if retrying fails.'), 'alert') + button(t('Cuba Simpan Semula', 'Retry Local Save'), 'retry-storage') + '</div>' : '';
  $('workspace').innerHTML = warning + (screen === 'pick' ? pick(s) : '<div class="layout">' + studio(s) + (screen === 'edit' ? editor(s) : exportPanel(s)) + '</div>');
  let left, right;
  if (screen === 'pick') {
    left = '<span class="small muted" role="status">' + photos.length + '/' + LIMIT + ' ' + t('foto', 'photos') + '</span>';
    right = (cameraOpen ? button(t('Kembali', 'Back'), 'close-camera', '', '', busy) : '') + button(t('Selesai', 'Done'), 'edit', 'primary', 'next', !p || busy || loading);
  } else if (screen === 'edit') {
    left = button(profileName(s, p.edit.profile), 'profile', 'quiet-btn profile-button', 'grid');
    right = (selecting ? button(t('Salin', 'Copy') + ' (' + chosen.size + ')', 'copy', '', 'layers') : button(t('Kelompok', 'Batch'), 'select', '', 'layers')) +
      button(t('Pratonton', 'Preview'), 'export', 'primary', 'next');
  } else {
    left = button(t('Kembali', 'Back'), 'edit', '', 'back');
    right = (typeof navigator.share === 'function' ? button(t('Kongsi', 'Share'), 'share', '', 'export') : '') +
      button(t('Muat Turun Foto Suntingan', 'Download Edited Photo'), 'export-edited', 'primary', 'export');
  }
  $('actions').innerHTML = '<div class="wrap">' + left + '<div class="group">' + right + '</div></div>';
}
