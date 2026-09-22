export type TimelineScene = { cut_ms?: number | null };

const DEFAULT_SCENE_MS = 8000;

export function sceneDurationMs(scene: TimelineScene): number {
  const cut = scene.cut_ms;
  return typeof cut === "number" && Number.isInteger(cut) && cut >= 500 && cut <= DEFAULT_SCENE_MS
    ? cut
    : DEFAULT_SCENE_MS;
}

export function sceneStartMs(scenes: TimelineScene[], index: number): number {
  return scenes.slice(0, Math.max(0, index)).reduce((sum, scene) => sum + sceneDurationMs(scene), 0);
}

export function storyDurationMs(scenes: TimelineScene[]): number {
  return sceneStartMs(scenes, scenes.length);
}

export function locateSceneAtMs(scenes: TimelineScene[], positionMs: number): { index: number; offsetMs: number } {
  if (!scenes.length) return { index: 0, offsetMs: 0 };
  let remaining = Math.min(Math.max(0, positionMs), storyDurationMs(scenes) - 1);
  for (let index = 0; index < scenes.length; index++) {
    const duration = sceneDurationMs(scenes[index]);
    if (remaining < duration || index === scenes.length - 1) return { index, offsetMs: remaining };
    remaining -= duration;
  }
  return { index: scenes.length - 1, offsetMs: 0 };
}
