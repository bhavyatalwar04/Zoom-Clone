import type { ImageSegmenter } from "@mediapipe/tasks-vision";

/**
 * Background blur / virtual background, done on-device.
 *
 * Every frame: a small copy of the camera image goes through MediaPipe's selfie segmentation
 * model, which returns how likely each pixel is to be the person. That mask cuts the person out
 * of the full-size frame, and the result is drawn over either a blurred copy of the frame or a
 * background image. The canvas is captured as a new video track that replaces the camera
 * track in every peer connection (no renegotiation, like mute / screen share).
 */

export type BackgroundEffect = { kind: "none" } | { kind: "blur" } | { kind: "image"; id: string; src: string };

const VISION_VERSION = "1.0.1"; // keep in sync with @mediapipe/tasks-vision in package.json
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
const FPS = 24;
const MASK_WIDTH = 256; // segmentation runs on a small frame; the mask is scaled up (which also softens its edges)

let segmenterPromise: Promise<ImageSegmenter> | null = null;

/** Loads the model once (lazily, so the ~10 MB runtime is only fetched if someone uses effects). */
function loadSegmenter(): Promise<ImageSegmenter> {
  segmenterPromise ??= (async () => {
    const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    const create = (delegate: "GPU" | "CPU") =>
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
    try {
      return await create("GPU");
    } catch {
      return await create("CPU");
    }
  })();
  segmenterPromise.catch(() => (segmenterPromise = null)); // allow a retry after a network error
  return segmenterPromise;
}

function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

export class BackgroundProcessor {
  /** The processed video, ready to send instead of the camera track. */
  readonly track: MediaStreamTrack;
  readonly input: MediaStreamTrack;

  private video = document.createElement("video");
  private output: HTMLCanvasElement;
  private person: HTMLCanvasElement;
  private small: HTMLCanvasElement;
  private mask: HTMLCanvasElement;
  private maskPixels: ImageData;
  private image: HTMLImageElement | null = null;
  private timer: ReturnType<typeof setInterval>;
  private lastTimestamp = 0;

  static async create(input: MediaStreamTrack, effect: BackgroundEffect): Promise<BackgroundProcessor> {
    return new BackgroundProcessor(await loadSegmenter(), input, effect);
  }

  private constructor(
    private segmenter: ImageSegmenter,
    input: MediaStreamTrack,
    private effect: BackgroundEffect,
  ) {
    this.input = input;
    const { width = 1280, height = 720 } = input.getSettings();
    const maskHeight = Math.round((MASK_WIDTH * height) / width);
    this.output = canvas(width, height);
    this.person = canvas(width, height);
    this.small = canvas(MASK_WIDTH, maskHeight);
    this.mask = canvas(MASK_WIDTH, maskHeight);
    this.maskPixels = new ImageData(MASK_WIDTH, maskHeight);

    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = new MediaStream([input]);
    void this.video.play().catch(() => undefined);

    this.setEffect(effect);
    this.track = this.output.captureStream(FPS).getVideoTracks()[0];
    // setInterval rather than requestAnimationFrame: rAF pauses in background tabs.
    this.timer = setInterval(() => this.renderFrame(), 1000 / FPS);
  }

  setEffect(effect: BackgroundEffect) {
    this.effect = effect;
    if (effect.kind === "image") {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = effect.src;
      this.image = img;
    } else {
      this.image = null;
    }
  }

  stop() {
    clearInterval(this.timer);
    this.track.stop();
    this.video.srcObject = null;
  }

  private renderFrame() {
    const { video, output, person, small, mask } = this;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    const { width, height } = output;

    // 1. Segment a small copy of the frame -> alpha mask (person = opaque).
    small.getContext("2d")!.drawImage(video, 0, 0, small.width, small.height);
    const timestamp = Math.max(performance.now(), this.lastTimestamp + 1); // must strictly increase
    this.lastTimestamp = timestamp;
    this.segmenter.segmentForVideo(small, timestamp, (result) => {
      const confidence = result.confidenceMasks?.[0]?.getAsFloat32Array();
      if (!confidence) return;
      const pixels = this.maskPixels.data;
      for (let i = 0; i < confidence.length; i++) pixels[i * 4 + 3] = confidence[i] * 255;
      mask.getContext("2d")!.putImageData(this.maskPixels, 0, 0);
    });

    // 2. Cut the person out of the full-size frame with the (scaled up, so softened) mask.
    const personCtx = person.getContext("2d")!;
    personCtx.globalCompositeOperation = "copy";
    personCtx.drawImage(video, 0, 0, width, height);
    personCtx.globalCompositeOperation = "destination-in";
    personCtx.drawImage(mask, 0, 0, width, height);

    // 3. Background (blurred frame or image), then the person on top.
    const ctx = output.getContext("2d")!;
    if (this.effect.kind === "image" && this.image?.complete && this.image.naturalWidth) {
      const img = this.image;
      const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight); // cover
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
    } else {
      ctx.filter = `blur(${Math.round(width / 80)}px)`;
      ctx.drawImage(video, 0, 0, width, height);
      ctx.filter = "none";
    }
    ctx.drawImage(person, 0, 0);
  }
}
