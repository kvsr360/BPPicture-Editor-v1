import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../camera.mjs';
import { makeEdit, migrateProfile, record, travel, copyAdjustments, makePreset, applyPreset } from '../state.mjs';
import { geometry, outputSize, sourcePoint } from '../render.mjs';
import { crc32, fileName, makeOutput, zip } from '../export.mjs';

class Track extends EventTarget {
  readyState = 'live';
  zoom = 1;
  constructor(facingMode) { super(); this.facingMode = facingMode; }
  stop() { this.readyState = 'ended'; }
  getSettings() { return { facingMode: this.facingMode, zoom: this.zoom }; }
  getCapabilities() { return { facingMode: ['user', 'environment'], zoom: { min: 1, max: 4, step: 0.1 } }; }
  async applyConstraints({ advanced: [{ zoom }] }) { this.zoom = zoom; }
}
const streamOf = track => ({ getTracks: () => [track], getVideoTracks: () => [track] });

test('camera releases the rear track before requesting the front, supports controls, and binds an existing video node', async () => {
  const tracks = [];
  const camera = new Camera(() => {}, {
    async getUserMedia({ audio, video }) {
      assert.equal(audio, false);
      if (tracks.length) assert.equal(tracks.at(-1).readyState, 'ended');
      const track = new Track(video.facingMode.exact ?? video.facingMode.ideal);
      tracks.push(track);
      return streamOf(track);
    },
  });
  const video = { srcObject: null, paused: true, classList: { toggle() {} }, play: async () => {} };
  const opening = camera.start('environment');
  camera.attach(video);
  assert.equal(await opening, true);
  camera.attach(video);
  assert.equal(video.srcObject.getVideoTracks()[0], tracks[0]);
  assert.equal(await camera.detectSwitch(), true);
  await camera.setControl('zoom', 2);
  assert.equal(camera.control('zoom').value, 2);
  assert.equal(camera.control('exposureCompensation'), null);
  await camera.start('user', true);
  assert.equal(camera.facing, 'user');
  camera.stop();
  assert.ok(tracks.every(track => track.readyState === 'ended'));
});

test('a permission denial is surfaced without repeatedly requesting permission', async () => {
  let calls = 0;
  const camera = new Camera(() => {}, {
    getUserMedia() { calls++; return Promise.reject(new DOMException('Denied', 'NotAllowedError')); },
  });
  await assert.rejects(camera.start(), { name: 'NotAllowedError' });
  assert.equal(calls, 1);
});

test('navigation while permission is pending releases the late stream', async () => {
  let answer;
  const camera = new Camera(() => {}, { getUserMedia: () => new Promise(resolve => { answer = resolve; }) });
  const opening = camera.start();
  camera.stop();
  const track = new Track('environment');
  answer(streamOf(track));
  assert.equal(await opening, false);
  assert.equal(track.readyState, 'ended');
});

test('legacy profile names migrate and only adjustment groups move across photos', () => {
  assert.deepEqual(migrateProfile('Malaysia–MyOnline Pasport'), { profile: 'id', channel: 'my' });
  assert.deepEqual(migrateProfile('United Kingdom–Passport Digital'), { profile: 'passport', channel: 'uk' });
  const original = makeEdit({ ratio: '1:1', values: { exposure: 15, sat: 30, panX: 25 } });
  const target = makeEdit({ ratio: '4:5', values: { panX: -35 } });
  copyAdjustments(original, target, ['light']);
  assert.deepEqual([target.values.exposure, target.values.sat, target.values.panX, target.ratio], [15, 0, -35, '4:5']);
  applyPreset(target, makePreset('Warm', original, true));
  assert.deepEqual([target.values.sat, target.values.panX, target.ratio], [30, -35, '4:5']);
  const photo = { edit: target, past: [], future: [] };
  record(photo);
  photo.edit.values.sat = 12;
  assert.equal(travel(photo, 'undo'), true);
  assert.equal(photo.edit.values.sat, 30);
  assert.equal(travel(photo, 'redo'), true);
  assert.equal(photo.edit.values.sat, 12);
});

test('output dimensions and inverse crop geometry use the same coordinates', () => {
  const edit = makeEdit({ rotation: 90, ratio: 'custom', width: 700, height: 1000, values: { zoom: 180, panX: 40 } });
  assert.deepEqual(outputSize(1920, 1440, edit), [700, 1000]);
  assert.deepEqual(outputSize(1920, 1440, edit, true), [1920, 1440]);
  const g = geometry(1920, 1440, 700, 1000, edit);
  assert.deepEqual(sourcePoint(g.x, g.y, 1920, 1440, 700, 1000, edit), [0.5, 0.5]);
});

test('original files reuse source bytes, names remain distinct, and ZIP has valid CRC', async () => {
  const bytes = new TextEncoder().encode('123456789');
  const original = new Blob([bytes], { type: 'image/jpeg' });
  const photo = { id: 'abcd12345678', name: 'Potret.jpg', source: 'import', blob: original };
  const output = await makeOutput(photo, 'original', 'image/jpeg');
  assert.equal(output.blob, original);
  assert.notEqual(output.name, fileName({ ...photo, id: 'abcd12345679' }, 'original', 'image/jpeg'));
  assert.match(fileName({ ...photo, source: 'camera' }, 'original', 'image/jpeg'), /camera-capture/);
  assert.equal(crc32(bytes), 0xcbf43926);
  const buffer = await (await zip([output])).arrayBuffer();
  const view = new DataView(buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint32(14, true), crc32(bytes));
  assert.equal(view.getUint32(buffer.byteLength - 22, true), 0x06054b50);
  assert.equal(view.getUint16(buffer.byteLength - 12, true), 1);
});
