const { mkdir, readFile } = require('node:fs/promises');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.BPP_PLAYWRIGHT || 'playwright');

const root = path.resolve(__dirname, '..');
const results = path.join(root, 'test-results');
const base = 'https://bppicture-test.invalid/repo/';
const mime = { '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

(async () => {
  await mkdir(results, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.BPP_BROWSER || undefined,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--disable-background-networking', '--disable-crash-reporter', '--no-sandbox'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, isMobile: true, hasTouch: true });
    await context.route(base + '**', async route => {
      const filename = new URL(route.request().url()).pathname.split('/').at(-1) || 'index.html';
      const bytes = await readFile(path.join(root, filename));
      await route.fulfill({ body: bytes, contentType: mime[path.extname(filename)] });
    });
    const page = await context.newPage();
    await context.addInitScript(() => {
      window.cameraAttempts = [];
      window.cameraTracks = [];
      const devices = navigator.mediaDevices;
      if (!devices) return;
      const original = devices.getUserMedia.bind(devices);
      devices.getUserMedia = async options => {
        try {
          const stream = await original(options);
          window.cameraTracks.push(...stream.getTracks());
          window.cameraAttempts.push(stream.getTracks().map(track => track.getSettings()));
          return stream;
        } catch (error) {
          window.cameraAttempts.push([error.name, error.message]);
          throw error;
        }
      };
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await page.getByRole('button', { name: 'Camera Take photos in the app' }).click();
    await page.getByRole('button', { name: 'Take photo', exact: true }).waitFor();
  try {
      await page.getByRole('button', { name: 'Take photo', exact: true }).click({ timeout: 6500 });
    } catch (error) {
      console.log(await page.evaluate(() => ({ attempts: window.cameraAttempts, status: document.querySelector('.canvas-float')?.textContent, width: document.querySelector('video')?.videoWidth, visibility: document.visibilityState })));
      throw error;
    }
    await page.getByText('Photo saved in the app on this device.').waitFor();
    await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0);
    await page.getByRole('button', { name: 'Take photo', exact: true }).click();
    await page.locator('.badge').getByText('2/25', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Retake', exact: true }).click();
    await page.locator('dialog').getByRole('button', { name: 'Retake', exact: true }).click();
    await page.getByRole('button', { name: 'Take photo', exact: true }).click();
    await page.getByText('Photo saved in the app on this device.').waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-act=edit]').disabled);
    assert.equal(await page.locator('.film-item').count(), 2);
    console.log('Browser getUserMedia repeated capture, retake, and IndexedDB save');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('heading', { name: 'Edit Photos' }).waitFor();
    assert.equal(await page.evaluate(() => window.cameraTracks.every(track => track.readyState === 'ended')), true);
    await page.reload();
    await page.locator('.badge').getByText('2/25', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.locator('[data-act=tab-crop]').click();
    await page.locator('#ratio').selectOption('custom');
    await page.locator('#width').fill('320');
    await page.locator('#width').press('Tab');
    await page.locator('#height').fill('400');
    await page.locator('#height').press('Tab');
    await page.locator('[data-act=tab-mask]').click();
    await page.locator('#r-feather').fill('0');
    await page.waitForFunction(() => document.querySelector('#editor-canvas').width === 320);
    const frame = page.locator('#editor-canvas');
    await frame.scrollIntoViewIfNeeded();
    const box = await frame.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const alpha = () => frame.evaluate(canvas => canvas.getContext('2d').getImageData(160, 200, 1, 1).data[3]);
    await page.waitForFunction(() => document.querySelector('#editor-canvas').getContext('2d').getImageData(160, 200, 1, 1).data[3] === 0);
    assert.equal(await alpha(), 0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#editor-canvas').getContext('2d').getImageData(160, 200, 1, 1).data[3] === 255);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#editor-canvas').getContext('2d').getImageData(160, 200, 1, 1).data[3] === 0);
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await frame.scrollIntoViewIfNeeded();
    const restore = await frame.boundingBox();
    await page.mouse.click(restore.x + restore.width / 2, restore.y + restore.height / 2);
    await page.waitForFunction(() => document.querySelector('#editor-canvas').getContext('2d').getImageData(160, 200, 1, 1).data[3] === 255);
    await page.locator('[data-act=tab-preset]').click();
    await page.getByRole('button', { name: 'Save Preset', exact: true }).click();
    await page.getByLabel('Preset name').fill('Verification preset');
    await page.locator('#preset-form').getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Verification preset', exact: true }).waitFor();
    await page.locator('[data-act=profile]').click();
    assert.equal(await page.locator('dialog [data-act^=profile-]').count(), 3);
    await page.locator('[data-act=profile-passport]').click();
    await page.locator('#channel').selectOption('uk');
    await page.locator('dialog').getByRole('button', { name: 'Done', exact: true }).click();
    await page.locator('[data-act=export].btn').click();
    await page.getByText('UK Digital requires an unaltered photo.', { exact: false }).waitFor();
    await page.locator('#format').selectOption('image/png');
    await page.getByRole('button', { name: 'Download Edited Photo' }).click();
    const editedDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const edited = await editedDownload;
    const png = await readFile(await edited.path());
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), 320);
    assert.equal(png.readUInt32BE(20), 400);
    await page.locator('dialog').getByRole('button', { name: 'Done', exact: true }).click();
    await page.locator('#scope').selectOption('all');
    await page.getByRole('button', { name: 'Download Original Photo' }).click();
    const zipDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download ZIP' }).click();
    const batch = await zipDownload;
    await batch.saveAs(path.join(results, 'bppicture-check.zip'));
    const zipBytes = await readFile(await batch.path());
    assert.equal(zipBytes.readUInt16LE(zipBytes.length - 12), 2);
    await page.locator('dialog').getByRole('button', { name: 'Done', exact: true }).click();
    console.log('Camera release, reload, erase/restore/undo/redo, presets, profile rules, 320×400 PNG and 2-file ZIP');

    await page.locator('[data-act=pick].step').click();
    await page.getByRole('button', { name: 'Camera Take photos in the app' }).click();
    await page.waitForFunction(() => !document.querySelector('[data-act=capture]').disabled);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.hidden;
    });
    await page.getByRole('button', { name: 'Start Camera', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.cameraTracks.at(-1).readyState), 'ended');
    await page.getByRole('button', { name: 'Start Camera', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[data-act=capture]').disabled);
    await page.locator('footer').getByRole('button', { name: 'Back', exact: true }).click();
    console.log('Camera stops on backgrounding and can resume');
    const sample = await readFile(path.join(root, 'sample.jpg'));
    await page.locator('#files').setInputFiles(Array.from({ length: 24 }, (_, i) => ({ name: 'test-' + i + '.jpg', mimeType: 'image/jpeg', buffer: sample })));
    await page.getByText('25-photo limit reached. Existing photos were kept.').waitFor();
    assert.equal(await page.locator('.film-item').count(), 25);
    await page.locator('[data-act=remove-24]').click();
    await page.locator('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
    await page.locator('.badge').getByText('24/25', { exact: true }).waitFor();
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Denied', 'NotAllowedError'));
    });
    await page.getByRole('button', { name: 'Camera Take photos in the app' }).click();
    await page.getByText('Camera access was denied.', { exact: false }).waitFor();
    await page.locator('#native-camera').setInputFiles({ name: 'phone-fallback.jpg', mimeType: 'image/jpeg', buffer: sample });
    await page.locator('.badge').getByText('25/25', { exact: true }).waitFor();
    console.log('25-photo cap, overflow, removal, camera denial, and fallback input');
    await page.locator('footer [data-act=edit]').click();
    await page.waitForFunction(() => document.querySelector('canvas')?.width > 0);
    await page.screenshot({ path: path.join(results, 'bppicture-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: path.join(results, 'bppicture-desktop.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
