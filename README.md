# BPPicture Editor V1.0

Bilingual, mobile-first photo editor. The white and purple surfaces, frosted bars, raised controls and three-step workflow follow the supplied UI/UX handoff. Bahasa Malaysia is the default. The **BM / EN** switch is in the app bar.

## Publish on GitHub Pages

1. Extract the ZIP. Create a GitHub repository, for example `bppicture-editor`. Put the extracted contents at the repository root, including `.nojekyll` and `index.html`.
2. Push the files to `main`. In the repository, go to **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, then **main → /(root) → Save**.
3. When GitHub finishes the Pages deployment, open the HTTPS URL shown in Settings. For a project repository it normally looks like `https://USERNAME.github.io/bppicture-editor/`. Enable **Enforce HTTPS** if the option is available and unchecked.
4. Open that address directly on your phone in Chrome for Android or Safari for iOS. Tap **Kamera → Allow**, take a photo with the shutter, then tap **Selesai** to edit the batch.

The site is static. Publishing requires no build, server, API key or npm install. GitHub Pages configuration and HTTPS are described in [GitHub's publishing guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) and [HTTPS guide](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

To preview on a development computer with Node.js 22 or later, run `node dev-server.mjs` and open `http://localhost:8080`. For camera testing on a phone, use the deployed HTTPS URL or another secure origin.

## Camera, editing and downloads

- **Kamera** opens a live video-only stream with the rear camera preferred. The shutter captures the current frame to a JPEG. The front preview can be mirrored while the saved frame keeps the camera's orientation. The switch, zoom and exposure compensation depend on capabilities the browser exposes.
- **Buka Kamera Telefon** opens the device's capture picker where supported. The browser may offer file selection instead. Use it if the live camera is denied or unavailable. Opening another workflow step or moving the page to the background releases the camera. Use **Hidupkan Kamera** to resume.
- Captures and edits are saved to IndexedDB. The current batch holds 25 photos across both capture and import. A failed local save leaves the photo available for retry or download during the current session. Use a download for copies you want in Files or the gallery. Browser storage may be cleared by the browser or user.
- **Larasan**, **Kedudukan**, **Latar** and **Pratetap** give each photo its own non-destructive edits. The filmstrip switches between photos. Use **Kelompok** to select targets and copy chosen adjustment groups. Use **Kedudukan** for framing and use the custom frame ratio when entering an exact pair of pixel dimensions.
- **Pratonton & Eksport** offers original and edited downloads for the current, selected or all photos. Multiple files are packaged in a ZIP. Original downloads copy the retained source bytes. In-app camera captures are labelled as camera-frame JPEGs. Edited files are canvas-encoded JPEGs or PNGs. PNG preserves transparency, while JPEG fills transparent areas with white.
- Photos and masks are processed on the device. Auto background removal fetches the MediaPipe JavaScript, WASM and model assets on first use. Photo bytes stay in the browser. Erase and restore brushes work independently of the model. Use **Panduan Aplikasi → Kosongkan Sesi** to remove stored app photos and edits.

## Checks and limitations

Run `node --test tests/core.test.mjs`. For syntax checks, use `node --check app.mjs` and repeat for the other `.mjs` modules. Optional browser verification uses `npm install --no-save playwright`, `npx playwright install chromium`, and `node tests/browser.cjs`. Set `BPP_BROWSER` to use an installed Chromium browser and `BPP_PLAYWRIGHT` to load an existing Playwright package.

This package was checked on Windows with Node.js 24 and Chromium 157 using a browser-supplied test camera. Coverage includes camera capture and retake, stream release, local storage and reload, permission denial, fallback file input, the 25-photo limit, manual masking and undo/redo, a named preset, the profile picker, PNG dimensions and ZIP downloads.

After publishing, confirm physical front/rear cameras and phone picker behavior on Android Chrome and iOS Safari. Check camera rotation, switching, permission recovery, hardware zoom and exposure if available, and background/resume. Run **Buang Latar Automatik** on portraits with hair, hijab and busy backgrounds. The runner could not resolve the model runtime CDN, so real model inference and edge quality remain to be verified. Exact handset performance, low-storage behavior and browser-specific HEIC decoding depend on the device. Edited export is limited to 24 megapixels to bound canvas memory, and the Position panel can be used to choose smaller dimensions.

See [RESEARCH.md](RESEARCH.md) for workflow benchmarks and application-channel rules.
