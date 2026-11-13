import { decode, canvasAt } from './render.mjs';
import { canvasBlob } from './camera.mjs';

const version = '0.10.21';
const runtime = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + version;
const model = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite';
let instance;

async function load() {
  if (!instance) {
    instance = (async () => {
      const { FilesetResolver, ImageSegmenter } = await import(runtime + '/vision_bundle.mjs');
      const wasm = await FilesetResolver.forVisionTasks(runtime + '/wasm');
      return ImageSegmenter.createFromOptions(wasm, {
        baseOptions: { modelAssetPath: model, delegate: 'CPU' },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
    })().catch(error => {
      instance = undefined;
      throw error;
    });
  }
  return instance;
}

export async function segment(blob) {
  const segmenter = await load();
  const source = await decode(blob);
  const factor = Math.min(1, 768 / Math.max(source.width, source.height));
  const input = canvasAt(source.width * factor, source.height * factor);
  let output;
  try {
    input.getContext('2d').drawImage(source, 0, 0, input.width, input.height);
    segmenter.segment(input, result => {
      const confidence = result.confidenceMasks?.[1];
      if (!confidence) throw new Error('Segmentation did not return a person mask.');
      const { width, height } = confidence;
      output = canvasAt(width, height);
      const ctx = output.getContext('2d');
      const rgba = ctx.createImageData(width, height);
      const values = confidence.getAsFloat32Array();
      for (let i = 0; i < values.length; i++) {
        const pixel = i * 4;
        const alpha = Math.max(0, Math.min(1, (values[i] - 0.18) / 0.64));
        rgba.data[pixel] = rgba.data[pixel + 1] = rgba.data[pixel + 2] = 255;
        rgba.data[pixel + 3] = Math.round(alpha * 255);
      }
      ctx.putImageData(rgba, 0, 0);
    });
    if (!output) throw new Error('Segmentation returned an empty mask.');
    return await canvasBlob(output, 'image/png');
  } finally {
    source.close?.();
    input.width = input.height = 1;
    if (output) output.width = output.height = 1;
  }
}
