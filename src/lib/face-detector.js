/**
 * Lazy-loaded BlazeFace wrapper for the Reference Image Guide.
 *
 * Goals:
 *   • Don't bloat the initial bundle. TFJS + BlazeFace are dynamically
 *     imported only when the user actually drops an image to check.
 *     The main /generate bundle stays the same size.
 *   • Stay inside the project CSP. Model weights are hosted at
 *     /public/models/blazeface/ so we never need to allow tfhub.dev
 *     in connect-src.
 *   • Be safe in SSR — every call guards on `typeof window`.
 *
 * Exports `detectFaces` which returns rich info the Reference Image
 * Guide uses to score the upload: count, primary face bbox (% of
 * source), landmarks (eyes / nose / mouth corners), and a confidence.
 */

// Local copy of the model — bundled in /public/models/blazeface/
const LOCAL_MODEL_URL = "/models/blazeface/model.json";

// Cache the singleton model promise so concurrent callers share the
// same load + we never re-initialise.
let modelPromise = null;

async function loadModel() {
  if (typeof window === "undefined") {
    throw new Error("face-detector: cannot load on the server");
  }
  if (!modelPromise) {
    modelPromise = (async () => {
      // Dynamic imports — code-split into a separate chunk so the
      // ~600 KB TFJS payload only ships when the user actually
      // triggers a face-quality check.
      const [tf, , blazeface] = await Promise.all([
        import("@tensorflow/tfjs-core"),
        import("@tensorflow/tfjs-backend-webgl"),
        import("@tensorflow-models/blazeface"),
      ]);
      await tf.setBackend("webgl");
      await tf.ready();
      // BlazeFace defaults to fetching weights from tfhub.dev — point
      // it at our /public/models/blazeface/ copy so CSP doesn't need
      // to allow tfhub.dev.
      const model = await blazeface.load({ modelUrl: LOCAL_MODEL_URL });
      return model;
    })().catch((err) => {
      modelPromise = null; // allow retry on next call after a transient failure
      throw err;
    });
  }
  return modelPromise;
}

/**
 * Decode any number a tensor-array helper may produce to a plain
 * JS number / array. BlazeFace can return TFJS Tensors instead of
 * arrays in some configurations.
 */
function toPair(v) {
  if (!v) return [0, 0];
  if (Array.isArray(v)) return v;
  if (typeof v.arraySync === "function") return v.arraySync();
  return [0, 0];
}
function toScalar(v) {
  if (typeof v === "number") return v;
  if (Array.isArray(v)) return v[0];
  if (v && typeof v.arraySync === "function") return v.arraySync()[0];
  return 0;
}

/**
 * Detect faces in an `<img>` / `<video>` / `<canvas>` and return
 * normalised data the Reference Image Guide uses to score quality.
 *
 * Output shape:
 *   {
 *     count: number,                     // how many faces detected
 *     sourceW, sourceH,                  // source dims in px
 *     primary: {                         // largest face, or null
 *       confidence: number,              // 0–1 model probability
 *       bbox: { x, y, w, h },            // ALL in % of source 0-100
 *       cx, cy, areaPct,                 // convenience derived values
 *       landmarks: {                     // each as { x, y } in %
 *         rightEye, leftEye, nose,
 *         mouth, rightEar, leftEar,
 *       }
 *     }
 *   }
 */
export async function detectFaces(source) {
  // Source intrinsic dims differ per element type.
  let sourceW = 0;
  let sourceH = 0;
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    sourceW = source.naturalWidth || source.width;
    sourceH = source.naturalHeight || source.height;
  } else if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
    sourceW = source.videoWidth;
    sourceH = source.videoHeight;
  } else if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
    sourceW = source.width;
    sourceH = source.height;
  }
  if (sourceW === 0 || sourceH === 0) {
    return { count: 0, sourceW, sourceH, primary: null };
  }

  const model = await loadModel();
  // returnTensors=false so we get plain arrays without manual disposal.
  const predictions = await model.estimateFaces(source, false);

  if (!predictions || predictions.length === 0) {
    return { count: 0, sourceW, sourceH, primary: null };
  }

  // Pick the largest face — usually the intended subject.
  let best = null;
  for (const p of predictions) {
    const [x1, y1] = toPair(p.topLeft);
    const [x2, y2] = toPair(p.bottomRight);
    const w = Math.max(0, x2 - x1);
    const h = Math.max(0, y2 - y1);
    if (w === 0 || h === 0) continue;
    const area = w * h;
    if (best && area <= best.area) continue;
    best = { p, x1, y1, w, h, area };
  }

  if (!best) {
    return { count: predictions.length, sourceW, sourceH, primary: null };
  }

  const conf = toScalar(best.p.probability);
  // BlazeFace landmark order: right eye, left eye, nose, mouth,
  // right ear tragion, left ear tragion. Each as [x, y] pixel coords.
  const lmRaw = best.p.landmarks ?? [];
  const lmPair = (i) => {
    if (!lmRaw || !lmRaw[i]) return null;
    const pt = toPair(lmRaw[i]);
    return { x: (pt[0] / sourceW) * 100, y: (pt[1] / sourceH) * 100 };
  };

  const bboxPct = {
    x: (best.x1 / sourceW) * 100,
    y: (best.y1 / sourceH) * 100,
    w: (best.w / sourceW) * 100,
    h: (best.h / sourceH) * 100,
  };

  return {
    count: predictions.length,
    sourceW,
    sourceH,
    primary: {
      confidence: conf,
      bbox: bboxPct,
      cx: bboxPct.x + bboxPct.w / 2,
      cy: bboxPct.y + bboxPct.h / 2,
      areaPct: bboxPct.w * bboxPct.h / 100, // face area as % of frame
      landmarks: {
        rightEye: lmPair(0),
        leftEye:  lmPair(1),
        nose:     lmPair(2),
        mouth:    lmPair(3),
        rightEar: lmPair(4),
        leftEar:  lmPair(5),
      },
    },
  };
}

/**
 * Decode an image URL or File object into an HTMLImageElement.
 */
export function loadImageElement(srcOrFile) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e instanceof Error ? e : new Error("image load failed"));
    if (typeof srcOrFile === "string") {
      img.src = srcOrFile;
    } else if (srcOrFile instanceof File || srcOrFile instanceof Blob) {
      img.src = URL.createObjectURL(srcOrFile);
    } else {
      reject(new Error("loadImageElement: expected string URL or File/Blob"));
    }
  });
}

/**
 * Sample the average luminance inside the face bbox to use as a
 * rough "lighting" signal. 0 = pure black, 1 = pure white.
 * Pulls a small 32x32 thumbnail through canvas — works for File
 * uploads, hotlinked URLs, anything that loaded as an `<img>`.
 */
export function sampleLuminance(img, bboxPct) {
  if (typeof document === "undefined" || !img || !bboxPct) return null;
  const canvas = document.createElement("canvas");
  const W = 32, H = 32;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  // Source rect in pixels from the bbox % values.
  const sx = (bboxPct.x / 100) * img.naturalWidth;
  const sy = (bboxPct.y / 100) * img.naturalHeight;
  const sw = (bboxPct.w / 100) * img.naturalWidth;
  const sh = (bboxPct.h / 100) * img.naturalHeight;
  try {
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    const { data } = ctx.getImageData(0, 0, W, H);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      // ITU-R BT.709 luminance approximation, normalised to 0-1.
      sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    }
    return sum / (W * H);
  } catch {
    // Canvas can throw a SecurityError if the image was cross-origin
    // without CORS headers — silently return null and let the score
    // omit the lighting check.
    return null;
  }
}
