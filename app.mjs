import { Camera } from './camera.mjs';
import { $, button, esc, iconButton, label, note, profilePanel, renderUI } from './ui.mjs';
import { LIMIT, adjustmentKeys, defaults, groups, makeEdit, parseDimension, record, snapshot, travel, copyAdjustments, makePreset, applyPreset } from './state.mjs';
import { loadSession, saveSession, loadPresets, savePresets } from './storage.mjs';
import { canvasAt, decode, outputSize, renderImage, sourcePoint, thumbnail } from './render.mjs';
import { segment } from './segment.mjs';
import { download, makeOutput, zip } from './export.mjs';

const s = {
  lang: 'ms', screen: 'pick', tab: 'light', active: 0, photos: [], chosen: new Set(),
  expanded: new Set(['light']), selecting: false, comparing: false, collapsed: false,
  scope: 'one', format: 'image/jpeg', overlay: false, brushMode: 'erase', presets: loadPresets(),
  busy: false, loading: true, storageProblem: false, cameraOpen: false, cameraPending: false,
  cameraReady: false, cameraMessage: '', retake: null, maskBusy: false,
  get current() { return this.photos[this.active]; },
  t: (ms, en) => s.lang === 'en' ? en : ms,
};
const { t } = s;
const dlg = $('dialog');
let toastTimer, saveTimer, saveGeneration = 0, cameraGeneration = 0, rangePrevious, drag;
let previewKey, previewData, previewRequest = 0, paintFrame;
let job;
const cameraVideos = new WeakSet();

try { if (localStorage.getItem('bppicture-language') === 'en') s.lang = 'en'; } catch {}

function info(text) {
  $('toast').textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 4400);
}

function showDialog(title, body) {
  dlg.innerHTML = '<div class="dialog-inner"><div class="card-head"><h2 id="dialog-title">' + esc(title) + '</h2>' +
    iconButton(t('Tutup', 'Close'), 'close', 'close') + '</div>' + body + '</div>';
  if (!dlg.open) dlg.showModal();
}

function confirmAction(title, message, action, name) {
  showDialog(title, '<div class="stack"><p>' + esc(message) + '</p>' + button(name, action, 'primary', 'trash') + '</div>');
}

function stopCamera() {
  cameraGeneration += 1;
  s.camera.stop();
  s.cameraPending = false;
  s.cameraReady = false;
}

function cameraError(error) {
  switch (error.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return t('Akses kamera ditolak. Benarkan kamera dalam tetapan laman atau buka kamera telefon.', 'Camera access was denied. Allow it in site settings or open the phone camera.');
    case 'NotFoundError':
    case 'OverconstrainedError':
      return t('Kamera yang diminta tidak dijumpai.', 'The requested camera was not found.');
    case 'SecurityError':
      return t('Buka aplikasi pada pautan HTTPS untuk mengakses kamera.', 'Open the app over HTTPS to access the camera.');
    default:
      return t('Kamera tidak dapat dibuka. Tutup aplikasi lain yang menggunakan kamera dan cuba semula.', 'The camera could not open. Close other apps using it and try again.');
  }
}

s.camera = new Camera(reason => {
  if (!s.cameraOpen) return;
  stopCamera();
  s.cameraMessage = reason === 'playback' ? t('Pratonton kamera tidak dapat dimainkan.', 'The camera preview could not play.') : t('Sambungan kamera terputus.', 'The camera disconnected.');
  render();
});

async function startCamera(facing, exact = false) {
  if (s.busy) return;
  const previous = s.camera.facing;
  const generation = ++cameraGeneration;
  s.cameraOpen = true;
  s.cameraReady = false;
  s.cameraPending = true;
  s.cameraMessage = '';
  const opening = s.camera.start(facing, exact);
  render();
  try {
    await opening;
  } catch (error) {
    if (generation !== cameraGeneration) return;
    if (exact && ['NotFoundError', 'OverconstrainedError'].includes(error.name)) {
      await startCamera(previous);
      info(t('Kamera sebelah lagi tidak tersedia.', 'The other camera is unavailable.'));
      return;
    }
    s.cameraMessage = cameraError(error);
  }
  if (generation !== cameraGeneration) return;
  s.cameraPending = false;
  render();
  if (await s.camera.detectSwitch() && generation === cameraGeneration) {
    render();
  }
}

function syncShutter(video) {
  const shutter = document.querySelector('[data-act="capture"]');
  if (!shutter || !video.isConnected) return;
  s.cameraReady = Boolean(s.camera.live && video.readyState >= 2 && video.videoWidth);
  shutter.disabled = !s.cameraReady || s.busy || (s.photos.length >= LIMIT && !s.retake);
}

function render({ focus = true } = {}) {
  const focused = focus ? document.activeElement : null;
  const action = focused?.dataset?.act;
  const identifier = focused?.id;
  const filmScroll = document.querySelector('.film')?.scrollLeft ?? 0;
  const toolScroll = document.querySelector('.controls')?.scrollTop ?? 0;
  const previousVideo = $('camera-video');
  renderUI(s);
  const film = document.querySelector('.film');
  const controls = document.querySelector('.controls');
  if (film) film.scrollLeft = filmScroll;
  if (controls) controls.scrollTop = toolScroll;
  let video = $('camera-video');
  if (video) {
    if (previousVideo && s.camera.live) {
      video.replaceWith(previousVideo);
      video = previousVideo;
    }
    if (!cameraVideos.has(video)) {
      cameraVideos.add(video);
      for (const event of ['loadeddata', 'playing', 'resize']) video.addEventListener(event, () => syncShutter(video));
    }
    s.camera.attach(video);
    syncShutter(video);
  }
  if (action) document.querySelector('[data-act="' + CSS.escape(action) + '"]')?.focus({ preventScroll: true });
  else if (identifier) $(identifier)?.focus({ preventScroll: true });
  preparePreview();
}

function releasePreview() {
  if (previewData?.source) previewData.source.width = previewData.source.height = 1;
  previewData?.mask?.close?.();
  previewData = null;
}

async function preparePreview() {
  const p = s.current;
  if (!$('editor-canvas') || !p) {
    previewRequest += 1;
    previewKey = null;
    releasePreview();
    return;
  }
  const maskBlob = p.edit.mask;
  if (previewKey?.p === p && previewKey.mask === maskBlob) {
    requestPaint();
    return;
  }
  previewKey = { p, mask: maskBlob };
  const token = ++previewRequest;
  let source, mask;
  try {
    const full = await decode(p.blob);
    const factor = Math.min(1, 850 / Math.max(full.width, full.height));
    source = canvasAt(full.width * factor, full.height * factor);
    try {
      source.getContext('2d').drawImage(full, 0, 0, source.width, source.height);
    } finally {
      full.close?.();
    }
    if (maskBlob) mask = await decode(maskBlob);
    if (token !== previewRequest) {
      source.width = source.height = 1;
      mask?.close?.();
      return;
    }
    releasePreview();
    previewData = { p, source, mask };
    requestPaint();
  } catch {
    if (source) source.width = source.height = 1;
    mask?.close?.();
    if (token !== previewRequest) return;
    previewKey = null;
    info(t('Pratonton foto tidak dapat dibuka.', 'The photo preview could not open.'));
  }
}

function requestPaint() {
  if (paintFrame) return;
  paintFrame = requestAnimationFrame(() => {
    paintFrame = undefined;
    const canvas = $('editor-canvas');
    const p = s.current;
    if (!canvas || !p || previewData?.p !== p) return;
    const [w, h] = outputSize(p.width, p.height, p.edit, s.comparing);
    const scale = Math.min(1, 760 / Math.max(w, h));
    const width = Math.max(1, Math.round(w * scale)), height = Math.max(1, Math.round(h * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    renderImage(canvas, previewData.source, p.edit, {
      original: s.comparing, mask: previewData.mask,
      overlay: s.screen === 'edit' && s.tab === 'mask' && s.overlay,
      jpeg: s.screen === 'export' && s.format === 'image/jpeg',
      draft: drag?.kind === 'mask' ? drag.stroke : null,
    });
  });
}

async function persist(announce = false) {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  const attempt = ++saveGeneration;
  try {
    await saveSession(s.photos, s.active);
    if (attempt !== saveGeneration) return true;
    if (s.storageProblem) {
      s.storageProblem = false;
      render();
    }
    if (announce) info(t('Foto disimpan dalam aplikasi pada peranti ini.', 'Photo saved in the app on this device.'));
    return true;
  } catch {
    if (attempt === saveGeneration) {
      s.storageProblem = true;
      render();
      info(t('Simpanan setempat gagal. Foto masih boleh dipulihkan daripada sesi ini.', 'Local save failed. The photo is still recoverable in this session.'));
    }
    return false;
  }
}

function persistSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 260);
}

function mutate(change) {
  const p = s.current;
  if (!p) return;
  record(p);
  change(p.edit);
  s.comparing = false;
  persistSoon();
  render();
}

function toPhoto(raw) {
  return {
    ...raw, url: URL.createObjectURL(raw.thumbnail ?? raw.blob), edit: makeEdit(raw.edit),
    past: Array.isArray(raw.past) ? raw.past.slice(-30).map(makeEdit) : [],
    future: Array.isArray(raw.future) ? raw.future.slice(-30).map(makeEdit) : [],
  };
}

async function addPhotos(files, source, replaceId = null, ownBusy = false) {
  if (s.loading || s.busy && !ownBusy || !files.length) return;
  const slot = s.photos.findIndex(photo => photo.id === replaceId);
  const space = LIMIT - s.photos.length + (slot >= 0 ? 1 : 0);
  let rejected = 0, accepted = 0;
  s.busy = true;
  render();
  try {
    for (const file of files) {
      if (accepted >= space) break;
      try {
        const data = await thumbnail(file);
        const p = toPhoto({
          id: crypto.randomUUID(), name: file.name || 'camera-' + Date.now() + '.jpg',
          source, blob: file, ...data,
        });
        if (!accepted && slot >= 0) {
          const old = s.photos[slot];
          s.chosen.delete(old.id);
          URL.revokeObjectURL(old.url);
          s.photos[slot] = p;
          s.active = slot;
        } else {
          s.photos.push(p);
          s.active = s.photos.length - 1;
        }
        accepted++;
      } catch {
        rejected++;
      }
    }
    if (accepted) {
      s.retake = null;
      await persist(source === 'camera' || source === 'native');
    }
  } finally {
    s.busy = false;
    render();
  }
  if (rejected) info(rejected + t(' fail foto tidak boleh dibuka oleh pelayar ini.', ' photo file(s) could not be opened by this browser.'));
  if (files.length > space + rejected) info(t('Had 25 foto dicapai. Foto sedia ada dikekalkan.', '25-photo limit reached. Existing photos were kept.'));
  document.querySelector('.film-item .thumb[data-act="photo-' + s.active + '"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

async function capture() {
  if (s.busy || !s.cameraReady || s.photos.length >= LIMIT && !s.retake) return;
  s.busy = true;
  const retake = s.retake;
  const operation = s.camera.capture();
  render();
  try {
    await addPhotos([await operation], 'camera', retake, true);
  } catch {
    info(t('Foto gagal ditangkap. Tunggu sehingga pratonton kamera aktif.', 'Capture failed. Wait for the live camera preview.'));
  } finally {
    s.busy = false;
    render();
  }
}

function navigate(to) {
  stopCamera();
  s.cameraOpen = false;
  s.retake = null;
  s.comparing = false;
  s.selecting = false;
  if (s.scope === 'selected' && !selectedPhotos().length) s.scope = 'one';
  s.screen = s.current ? to : 'pick';
  render({ focus: false });
  $('intro').querySelector('h1').setAttribute('tabindex', '-1');
  $('intro').querySelector('h1').focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

const selectedPhotos = () => s.photos.filter(p => s.chosen.has(p.id));

function choosePhoto(index) {
  if (!s.photos[index] || s.busy) return;
  if (s.selecting) {
    const id = s.photos[index].id;
    if (s.chosen.has(id)) s.chosen.delete(id);
    else s.chosen.add(id);
  } else {
    if (s.active !== index) s.retake = null;
    s.active = index;
    s.comparing = false;
    persistSoon();
  }
  render();
}

function removePhoto(id) {
  const index = s.photos.findIndex(p => p.id === id);
  if (index < 0) return;
  const [p] = s.photos.splice(index, 1);
  URL.revokeObjectURL(p.url);
  s.chosen.delete(p.id);
  if (s.retake === id) s.retake = null;
  if (index < s.active) s.active--;
  s.active = Math.max(0, Math.min(s.active, s.photos.length - 1));
  persist();
  render();
}

function batchSheet() {
  const p = s.current;
  const targets = selectedPhotos().filter(photo => photo !== p);
  const labels = { light: t('Cahaya', 'Light'), color: t('Warna', 'Colour'), detail: t('Butiran', 'Detail') };
  showDialog(t('Salin Larasan', 'Copy Adjustments'), '<div class="stack"><p>' + esc(t('Sumber: ', 'Source: ') + p.name + ' · ' + targets.length + t(' sasaran', ' targets')) + '</p>' +
    Object.keys(groups).map(key => '<label class="choice"><span>' + labels[key] + '</span><input type="checkbox" name="copy-group" value="' + key + '" checked></label>').join('') +
    '<label class="choice"><span>' + t('Buang latar untuk setiap foto sasaran', 'Remove background for each target photo') + '</span><input type="checkbox" id="batch-mask"></label>' +
    button(t('Terapkan', 'Apply'), 'copy-apply', 'primary', 'check', !targets.length) +
    button(t('Tamat Pilihan', 'Finish Selection'), 'select-done') + '</div>');
}

function closeDialog() {
  if (job?.running) {
    job.cancelled = true;
    return;
  }
  dlg.close();
}

dlg.addEventListener('cancel', event => {
  if (!job?.running) return;
  event.preventDefault();
  job.cancelled = true;
});

const nextFrame = () => new Promise(resolve => setTimeout(resolve, 0));

function progressSheet(title, count) {
  showDialog(title, '<div class="stack"><progress id="job-progress" value="0" max="' + count + '" aria-label="' + t('Kemajuan', 'Progress') + '"></progress><p role="status" id="job-count">0 / ' + count + '</p>' +
    button(t('Batal', 'Cancel'), 'cancel-job') + '</div>');
}

function progress(index, total) {
  $('job-progress').value = index;
  $('job-count').textContent = index + ' / ' + total;
}

async function runMask(targets) {
  if (s.maskBusy || !targets.length) return;
  job = { mode: 'mask', cancelled: false, running: true, errors: [], complete: 0 };
  s.maskBusy = true;
  progressSheet(t('Membuang Latar', 'Removing Background'), targets.length);
  let index = 0;
  for (const p of targets) {
    await nextFrame();
    if (job.cancelled) break;
    try {
      const mask = await segment(p.blob);
      if (job.cancelled) break;
      if (s.photos.includes(p)) {
        record(p);
        p.edit.mask = mask;
        job.complete++;
      }
    } catch {
      job.errors.push(p);
    }
    progress(++index, targets.length);
  }
  s.maskBusy = false;
  job.running = false;
  if (job.complete) {
    s.comparing = false;
    persist();
    render();
  }
  showDialog(t('Hasil Topeng', 'Mask Results'), '<div class="stack">' +
    note(job.complete + t(' foto diproses.', ' photo(s) processed.'), 'good') +
    (job.cancelled ? note(t('Pemprosesan dibatalkan.', 'Processing cancelled.')) : '') +
    (job.errors.length ? note(t('Model automatik tidak dapat memproses: ', 'The automatic model could not process: ') + job.errors.map(p => p.name).join(', ') +
      t('. Cuba lagi dengan sambungan Internet atau gunakan berus.', '. Retry with an Internet connection or use the brush.'), 'alert') +
      button(t('Cuba Semula', 'Retry'), 'retry-job', '', 'rotate') : '') +
    button(t('Selesai', 'Done'), 'close', 'primary', 'check') + '</div>');
}

function targetsForScope() {
  if (s.scope === 'selected') return selectedPhotos();
  return s.scope === 'all' ? s.photos : [s.current];
}

async function runExport(kind, photos = targetsForScope(), share = false, type = s.format, previous = []) {
  if (job?.running || !photos.length) return;
  job = { mode: 'export', kind, share, type, cancelled: false, running: true, errors: [], outputs: [...previous] };
  progressSheet(t('Menyediakan Foto', 'Preparing Photos'), photos.length);
  let index = 0;
  for (const p of photos) {
    await nextFrame();
    if (job.cancelled) break;
    try {
      const output = await makeOutput(p, kind, type);
      job.outputs.push(output);
    } catch (error) {
      job.errors.push({ p, large: error.message === 'OUTPUT_SIZE' });
    }
    progress(++index, photos.length);
  }
  if (job.outputs.length) {
    try {
      job.download = job.outputs.length === 1 ? job.outputs[0] :
        { name: 'BPPicture-' + kind + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.zip', blob: await zip(job.outputs) };
    } catch {
      job.zipFailed = true;
    }
  }
  job.running = false;
  exportResults();
}

function exportResults() {
  const canShare = job.share && job.download && navigator.canShare?.({
    files: [new File([job.download.blob], job.download.name, { type: job.download.blob.type })],
  });
  showDialog(t('Hasil Eksport', 'Export Results'), '<div class="stack">' +
    note(job.outputs.length + t(' fail sedia untuk disimpan.', ' file(s) ready to save.'), 'good') +
    (job.cancelled ? note(t('Eksport dibatalkan. Hasil yang siap masih boleh disimpan.', 'Export cancelled. Completed files are still available.')) : '') +
    (job.errors.length ? '<ul class="job-errors">' + job.errors.map(({ p, large }) => '<li>' + esc(p.name) + ' · ' + (large ? t('Kecilkan dimensi di Kedudukan.', 'Reduce the dimensions in Position.') : t('Gagal dieksport.', 'Export failed.')) + '</li>').join('') + '</ul>' : '') +
    (job.download ? button(t('Muat Turun', 'Download') + (job.outputs.length > 1 ? ' ZIP' : ''), 'download-job', 'primary', 'export') : '') +
    (job.zipFailed ? note(t('ZIP tidak dapat dibuat. Muat turun setiap fail secara berasingan.', 'The ZIP could not be created. Download the files individually.'), 'alert') +
      job.outputs.map(({ name }, i) => button(name, 'download-item-' + i, '', 'export')).join('') : '') +
    (canShare ? button(t('Kongsi Fail', 'Share File'), 'share-job', '', 'export') : '') +
    (job.errors.length ? button(t('Cuba Semula Fail Gagal', 'Retry Failed Files'), 'retry-job', '', 'rotate') : '') +
    button(t('Selesai', 'Done'), 'close', '', 'check') + '</div>');
}

function savePresetList() {
  try { savePresets(s.presets); }
  catch { info(t('Pratetap hanya tersedia dalam sesi ini.', 'Presets are only available in this session.')); }
}

const actions = {
  pick: () => navigate('pick'),
  edit: () => navigate('edit'),
  export: () => navigate('export'),
  upload: () => $('files').click(),
  camera: () => startCamera('environment'),
  'resume-camera': () => startCamera(),
  'close-camera': () => navigate('pick'),
  flip: () => startCamera(s.camera.facing === 'user' ? 'environment' : 'user', true),
  capture,
  native() {
    if (s.busy) return;
    stopCamera();
    $('native-camera').click();
    render();
  },
  retake() {
    if (!s.retake) {
      confirmAction(t('Ambil Semula', 'Retake'), t('Gantikan foto ini? Tangkapan baharu akan menggantikan salinan yang disimpan dalam aplikasi.', 'Replace this photo? The next capture will replace the copy stored in the app.'), 'retake-yes', t('Ambil Semula', 'Retake'));
      return;
    }
    s.retake = null;
    render();
  },
  'retake-yes'() { s.retake = s.current?.id; dlg.close(); render(); },
  async sample() {
    try {
      const response = await fetch('./sample.jpg');
      if (!response.ok) throw new Error('Sample unavailable.');
      const file = new File([await response.blob()], 'BPPicture-sample.jpg', { type: 'image/jpeg' });
      await addPhotos([file], 'import');
    } catch {
      info(t('Foto contoh tidak dapat dimuatkan.', 'The sample photo could not load.'));
    }
  },
  close: closeDialog,
  'retry-storage': () => persist(true),
  help() {
    showDialog(t('Panduan Aplikasi', 'App Guide'), '<div class="stack"><p>' +
      t('Pilih foto atau buka kamera, sunting, kemudian muat turun. Foto dan suntingan disimpan dalam pelayar ini.', 'Choose photos or open the camera, edit, then download. Photos and edits are saved in this browser.') + '</p>' +
      note(t('Pelayar boleh membuang simpanan setempat. Muat turun foto yang ingin disimpan di luar aplikasi.', 'The browser may clear local storage. Download photos you want to keep outside the app.')) +
      button(t('Kosongkan Sesi', 'Clear Session'), 'clear-session', '', 'trash', !s.photos.length || s.busy) + '</div>');
  },
  'camera-help'() {
    showDialog(t('Kamera', 'Camera'), '<p>' + t('Benarkan akses kamera pada pautan HTTPS. Zum dan pampasan dedahan bergantung pada kamera dan pelayar. Foto tangkapan disimpan dalam aplikasi sehingga anda memuat turunnya.', 'Allow camera access on an HTTPS link. Zoom and exposure compensation depend on the camera and browser. Captures are stored in the app until you download them.') + '</p>');
  },
  'clear-session': () => confirmAction(t('Kosongkan Sesi', 'Clear Session'), t('Padam semua foto dan suntingan yang disimpan dalam aplikasi ini?', 'Delete all photos and edits stored in this app?'), 'clear-session-yes', t('Padam', 'Delete')),
  'clear-session-yes'() {
    for (const photo of s.photos) URL.revokeObjectURL(photo.url);
    s.photos = [];
    s.chosen.clear();
    s.active = 0;
    dlg.close();
    persist();
    navigate('pick');
  },
  profile: () => showDialog(t('Profil Dokumen', 'Document Profiles'), profilePanel(s)),
  compare() { s.comparing = !s.comparing; render(); },
  collapse() { s.collapsed = !s.collapsed; render(); },
  undo() { if (travel(s.current, 'undo')) { persistSoon(); render(); } },
  redo() { if (travel(s.current, 'redo')) { persistSoon(); render(); } },
  reset: () => mutate(edit => { for (const key of adjustmentKeys) edit.values[key] = defaults[key]; }),
  rotate: () => mutate(edit => { edit.rotation = (edit.rotation + 90) % 360; }),
  'reset-position': () => mutate(edit => {
    for (const key of ['zoom', 'panX', 'panY', 'straight', 'guide']) edit.values[key] = defaults[key];
    Object.assign(edit, { rotation: 0, width: 0, height: 0, ratio: 'original' });
  }),
  'auto-mask': () => runMask([s.current]),
  'reset-mask': () => mutate(edit => { edit.mask = null; edit.strokes = []; }),
  select() {
    s.selecting = true;
    render();
    info(t('Ketik foto sasaran, kemudian pilih Salin.', 'Tap target photos, then choose Copy.'));
  },
  copy: batchSheet,
  'select-done'() { s.selecting = false; dlg.close(); render(); },
  'copy-apply'() {
    const p = s.current;
    const chosen = [...dlg.querySelectorAll('[name="copy-group"]:checked')].map(input => input.value);
    const autoMask = $('batch-mask').checked;
    const targets = selectedPhotos().filter(photo => photo !== p);
    if (chosen.length) {
      for (const target of targets) {
        record(target);
        copyAdjustments(p.edit, target.edit, chosen);
      }
      persistSoon();
    }
    s.selecting = false;
    render();
    if (autoMask) runMask(targets);
    else {
      dlg.close();
      if (chosen.length) info(t('Larasan disalin.', 'Adjustments copied.'));
    }
  },
  'save-preset'() {
    showDialog(t('Simpan Pratetap', 'Save Preset'), '<form class="stack" id="preset-form"><label class="field">' +
      t('Nama pratetap', 'Preset name') + '<input name="name" maxlength="40" required></label><label class="checkbox"><input name="style" type="checkbox"> ' +
      t('Sertakan profil dan warna latar', 'Include profile and background colour') + '</label><button class="btn primary" type="submit">' +
      t('Simpan', 'Save') + '</button></form>');
    dlg.querySelector('input[name="name"]').focus();
  },
  'export-original': () => runExport('original'),
  'export-edited': () => runExport('edited'),
  share: () => runExport('edited', targetsForScope(), true),
  'cancel-job'() { if (job?.running) job.cancelled = true; },
  'retry-job'() {
    if (job.mode === 'mask') runMask(job.errors);
    else runExport(job.kind, job.errors.map(({ p }) => p), job.share, job.type, job.outputs);
  },
  'download-job': () => download(job.download),
  async 'share-job'() {
    const { blob, name } = job.download;
    try { await navigator.share({ files: [new File([blob], name, { type: blob.type })] }); }
    catch (error) {
      if (error.name !== 'AbortError') info(t('Fail tidak dapat dikongsi. Gunakan Muat Turun.', 'The file could not be shared. Use Download.'));
    }
  },
};

document.addEventListener('click', event => {
  const target = event.target.closest('[data-act]');
  const action = target?.dataset.act;
  const openTip = document.querySelector('.tip[data-open]');
  if (openTip && !openTip.contains(target)) {
    delete openTip.dataset.open;
    openTip.querySelector('button').setAttribute('aria-expanded', 'false');
  }
  if (!action || target.disabled) return;
  if (Object.hasOwn(actions, action)) {
    actions[action]();
    return;
  }
  if (action === 'tip') {
    const tip = target.closest('.tip');
    const open = tip.hasAttribute('data-open');
    tip.toggleAttribute('data-open', !open);
    tip.toggleAttribute('data-closed', open);
    target.setAttribute('aria-expanded', String(!open));
  } else if (action.startsWith('lang-')) {
    s.lang = action.slice(5);
    try { localStorage.setItem('bppicture-language', s.lang); } catch {}
    render();
  } else if (action.startsWith('tab-')) {
    s.tab = action.slice(4);
    s.comparing = false;
    render();
  } else if (action.startsWith('photo-')) {
    choosePhoto(Number(action.slice(6)));
  } else if (action.startsWith('profile-')) {
    const profile = action.slice(8);
    mutate(edit => {
      edit.profile = profile;
      if (profile === 'id' && edit.ratio === 'original') edit.ratio = '7:10';
    });
    actions.profile();
  } else if (action.startsWith('remove-yes-')) {
    dlg.close();
    removePhoto(action.slice(11));
  } else if (action.startsWith('remove-')) {
    const p = s.photos[Number(action.slice(7))];
    if (!p) return;
    const captured = ['camera', 'native'].includes(p.source);
    const message = captured ?
      t('Alih keluar foto ini dan padam salinan yang disimpan dalam aplikasi? Sebarang salinan yang telah dimuat turun akan kekal.', 'Remove this photo and delete the copy stored in the app? Any downloaded copies remain.') :
      t('Alih keluar foto ini daripada kelompok? Fail pada peranti anda akan kekal.', 'Remove this photo from the batch? The source file on your device remains.');
    confirmAction(t('Alih Keluar Foto', 'Remove Photo'), message, 'remove-yes-' + p.id, t('Alih Keluar', 'Remove'));
  } else if (['erase', 'restore', 'pan'].includes(action)) {
    s.brushMode = action;
    s.comparing = false;
    render();
  } else if (action.startsWith('apply-preset-')) {
    const preset = s.presets[Number(action.slice(13))];
    if (preset) mutate(edit => applyPreset(edit, preset));
  } else if (action.startsWith('delete-preset-')) {
    const index = Number(action.slice(14));
    confirmAction(t('Padam Pratetap', 'Delete Preset'), s.presets[index].name, 'delete-confirm-' + index, t('Padam', 'Delete'));
  } else if (action.startsWith('delete-confirm-')) {
    s.presets.splice(Number(action.slice(15)), 1);
    savePresetList();
    dlg.close();
    render();
  } else if (action.startsWith('download-item-')) {
    download(job.outputs[Number(action.slice(14))]);
  }
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || dlg.open) return;
  const tip = document.querySelector('.tip[data-open]');
  if (!tip) return;
  delete tip.dataset.open;
  tip.toggleAttribute('data-closed', true);
  tip.querySelector('button').setAttribute('aria-expanded', 'false');
});

document.addEventListener('focusout', event => {
  const tip = event.target.closest('.tip');
  if (tip && !tip.contains(event.relatedTarget)) {
    delete tip.dataset.closed;
    delete tip.dataset.open;
    tip.querySelector('button').setAttribute('aria-expanded', 'false');
  }
});

document.addEventListener('submit', event => {
  if (event.target.id !== 'preset-form') return;
  event.preventDefault();
  const data = new FormData(event.target);
  const name = data.get('name').trim();
  if (!name) return;
  s.presets.push(makePreset(name, s.current.edit, data.has('style')));
  savePresetList();
  dlg.close();
  render();
});

for (const [input, source] of [['files', 'import'], ['native-camera', 'native']]) {
  $(input).addEventListener('change', event => {
    const files = [...event.target.files];
    event.target.value = '';
    addPhotos(files, source, source === 'native' ? s.retake : null);
  });
}

document.addEventListener('toggle', event => {
  const key = event.target.dataset?.section;
  if (!key || !event.target.isConnected) return;
  if (event.target.open) s.expanded.add(key);
  else s.expanded.delete(key);
}, true);

document.addEventListener('input', event => {
  const el = event.target;
  const key = el.dataset.range;
  if (!key) return;
  const value = Number(el.value);
  $('v-' + key).value = value;
  if (key.startsWith('camera-') || !s.current) return;
  if (rangePrevious?.el !== el) rangePrevious = { el, p: s.current, edit: snapshot(s.current.edit) };
  s.current.edit.values[key] = value;
  if (key === 'guide') document.querySelector('.crop-guides')?.style.setProperty('--guide', value + '%');
  else requestPaint();
});

document.addEventListener('change', async event => {
  const el = event.target;
  const key = el.dataset.range;
  if (key?.startsWith('camera-')) {
    const control = key.slice(7);
    try {
      await s.camera.setControl(control, Number(el.value));
    } catch {
      const actual = s.camera.control(control);
      if (el.isConnected && actual) el.value = $('v-' + key).value = actual.value;
      info(t('Tetapan kamera ini tidak dapat digunakan.', 'This camera setting could not be applied.'));
    }
    return;
  }
  if (key && rangePrevious?.el === el) {
    const { p, edit } = rangePrevious;
    rangePrevious = null;
    if (p.edit.values[key] !== edit.values[key]) {
      record(p, edit);
      persistSoon();
      const undo = document.querySelector('[data-act="undo"]');
      const redo = document.querySelector('[data-act="redo"]');
      if (undo) undo.disabled = false;
      if (redo) redo.disabled = true;
    }
  } else if (el.id === 'scope' || el.id === 'format') {
    s[el.id] = el.value;
    render();
  } else if (el.id === 'mask-overlay') {
    s.overlay = el.checked;
    render();
  } else if (['ratio', 'channel', 'background', 'width', 'height'].includes(el.id)) {
    if (el.validity && !el.validity.valid) { el.reportValidity(); return; }
    mutate(edit => { edit[el.id] = el.type === 'number' ? parseDimension(el.value) : el.value; });
  }
});

function point(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return [(event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height];
}

function brushPoint(event) {
  const { canvas, p, stroke } = drag;
  const [x, y] = point(canvas, event);
  const next = sourcePoint(x, y, p.width, p.height, canvas.width, canvas.height, p.edit);
  const last = stroke.points.at(-1);
  if (!last) { stroke.points.push(next); return; }
  const distance = Math.hypot((next[0] - last[0]) * p.width, (next[1] - last[1]) * p.height);
  const spacing = Math.max(1, Math.min(p.width, p.height) * stroke.size / 420);
  const steps = Math.min(600, Math.ceil(distance / spacing));
  for (let i = 1; i <= steps; i++) {
    stroke.points.push([last[0] + (next[0] - last[0]) * i / steps, last[1] + (next[1] - last[1]) * i / steps]);
  }
}

let longPress, longPressed;
document.addEventListener('pointerdown', event => {
  const thumb = event.target.closest('.thumb[data-act^="photo-"]');
  if (thumb && s.screen === 'edit' && !s.selecting && event.pointerType !== 'mouse') {
    const start = [event.clientX, event.clientY];
    longPress = { start, timer: setTimeout(() => {
      s.selecting = true;
      longPressed = Date.now();
      choosePhoto(Number(thumb.dataset.act.slice(6)));
    }, 500) };
  }
  const canvas = event.target.closest('#editor-canvas');
  const p = s.current;
  if (!canvas || !p || !event.isPrimary || event.button !== 0 || s.screen !== 'edit' || s.comparing || !['mask', 'crop'].includes(s.tab)) return;
  const kind = s.tab === 'mask' && s.brushMode !== 'pan' ? 'mask' : 'pan';
  drag = { canvas, p, kind, id: event.pointerId, start: point(canvas, event), edit: snapshot(p.edit), changed: false };
  canvas.setPointerCapture(event.pointerId);
  if (kind === 'mask') {
    const { brush, feather } = p.edit.values;
    drag.stroke = { mode: s.brushMode, size: brush, feather, points: [] };
    brushPoint(event);
    requestPaint();
  }
});

document.addEventListener('pointermove', event => {
  if (longPress && Math.hypot(event.clientX - longPress.start[0], event.clientY - longPress.start[1]) > 9) {
    clearTimeout(longPress.timer);
    longPress = null;
  }
  if (drag?.id !== event.pointerId) return;
  const { canvas, p, edit, start } = drag;
  if (drag.kind === 'mask') brushPoint(event);
  else {
    const [x, y] = point(canvas, event);
    const angle = (edit.rotation + edit.values.straight) * Math.PI / 180;
    const dx = (x - start[0]) * Math.cos(angle) + (y - start[1]) * Math.sin(angle);
    const dy = (y - start[1]) * Math.cos(angle) - (x - start[0]) * Math.sin(angle);
    p.edit.values.panX = Math.round(Math.max(-100, Math.min(100, edit.values.panX + 250 * dx / canvas.width)));
    p.edit.values.panY = Math.round(Math.max(-100, Math.min(100, edit.values.panY + 250 * dy / canvas.height)));
    drag.changed = true;
  }
  requestPaint();
});

for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, event => {
  clearTimeout(longPress?.timer);
  longPress = null;
  if (drag?.id !== event.pointerId) return;
  const { p, kind, edit, stroke, changed } = drag;
  drag = null;
  if (kind === 'mask') p.edit.strokes = [...p.edit.strokes, stroke];
  if (changed || kind === 'mask') {
    record(p, edit);
    persistSoon();
    render();
  }
});

document.addEventListener('click', event => {
  if (Date.now() - longPressed < 700 && event.target.closest('.film')) event.stopImmediatePropagation();
}, true);

function suspendCamera() {
  if (!s.cameraOpen) return;
  stopCamera();
  s.cameraMessage = '';
  render({ focus: false });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    suspendCamera();
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
      if (!s.loading) persist();
    }
  }
});
window.addEventListener('pagehide', () => {
  stopCamera();
  if (saveTimer && !s.loading) persist();
});
window.addEventListener('pageshow', event => {
  if (event.persisted && s.cameraOpen) render();
});

render({ focus: false });
try {
  const saved = await loadSession();
  if (Array.isArray(saved?.photos)) {
    s.photos = saved.photos.filter(p => p?.blob instanceof Blob && p.width && p.height).slice(0, LIMIT).map(toPhoto);
    s.active = Math.max(0, Math.min(Number(saved.active) || 0, s.photos.length - 1));
  }
} catch {
  s.storageProblem = true;
}
s.loading = false;
render({ focus: false });
