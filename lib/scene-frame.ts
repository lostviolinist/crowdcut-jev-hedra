function waitForVideo(video: HTMLVideoElement, eventName: "loadedmetadata" | "seeked") {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error("The video frame took too long to load.")), 20_000);
    const ready = () => finish();
    const failed = () => finish(new Error("The completed video could not be opened for the next scene."));
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, ready);
      video.removeEventListener("error", failed);
      if (error) reject(error);
      else resolve();
    };
    video.addEventListener(eventName, ready);
    video.addEventListener("error", failed);
  });
}

export type SceneHandoff = { frame: Blob; cutMs: number };

export async function captureSceneHandoffFromUrl(url: string): Promise<SceneHandoff> {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    const metadata = waitForVideo(video, "loadedmetadata");
    video.load();
    await metadata;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) {
      throw new Error("The completed video has no usable final frame.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the next scene frame.");
    // Avoid handing a dark fade or final-frame artifact to the next generation.
    const small = document.createElement("canvas");
    small.width = 64;
    small.height = 36;
    const smallContext = small.getContext("2d");
    let bestTime = Math.max(0, video.duration - 0.5);
    let bestScore = -1;
    for (const secondsBeforeEnd of [0.5, 0.8, 1.3]) {
      const time = Math.max(0, video.duration - secondsBeforeEnd);
      const seeked = waitForVideo(video, "seeked");
      video.currentTime = time;
      await seeked;
      if (!smallContext) continue;
      smallContext.drawImage(video, 0, 0, 64, 36);
      const pixels = smallContext.getImageData(0, 0, 64, 36).data;
      let brightness = 0;
      for (let i = 0; i < pixels.length; i += 4) brightness += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      const score = brightness / (pixels.length / 4);
      if (score > bestScore) { bestScore = score; bestTime = time; }
      if (score >= 55) break;
    }
    if (Math.abs(video.currentTime - bestTime) > 0.01) {
      const seeked = waitForVideo(video, "seeked");
      video.currentTime = bestTime;
      await seeked;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not capture the next scene frame.")), "image/png");
    });
    return { frame, cutMs: Math.min(8000, Math.max(500, Math.round(bestTime * 1000))) };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}

// The original single-tab demo still consumes only the image.
export async function captureLastSceneFrameFromUrl(url: string): Promise<Blob> {
  return (await captureSceneHandoffFromUrl(url)).frame;
}

export function captureLastSceneFrame(jobId: string): Promise<Blob> {
  return captureLastSceneFrameFromUrl("/api/hedra/media/" + encodeURIComponent(jobId));
}
