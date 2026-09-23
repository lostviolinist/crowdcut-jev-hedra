import { STORY_PREMISE, STORY_SEARCH_GOAL, STORY_VISUAL_STYLE } from "./story";

const HEDRA_BASE_URL = "https://api.hedra.com/v3";
export type StoryRenderPreset = "fastest" | "fast" | "quality";
const RENDER_PRESETS = {
  fastest: { model: "minimax-h3-max-turbo", resolution: "480p", duration_ms: 8000 },
  fast: { model: "minimax-h3-max-turbo", resolution: "768p", duration_ms: 5000 },
  quality: { model: "minimax-h3", resolution: "4K", duration_ms: 8000 },
} as const;

export function parseStoryRenderPreset(value: unknown): StoryRenderPreset | null {
  if (value == null) return "quality"; // Older open tabs keep their original render settings.
  return value === "fastest" || value === "fast" || value === "quality" ? value : null;
}

export type HedraStoryInput = {
  prompt: string;
  aspect_ratio?: "16:9";
  resolution: "480p" | "768p" | "4K";
  duration_ms: 5000 | 8000;
  start_image?: { source: "url"; url: string };
};

export type StoryContinuity = { sceneNumber: number; previousActions: string[] };

function getApiKey() {
  const apiKey = process.env.HEDRA_API_KEY?.trim();
  if (!apiKey) throw new Error("HEDRA_API_KEY is not configured.");
  return apiKey;
}

async function hedraRequest(path: string, init?: RequestInit) {
  const response = await fetch(`${HEDRA_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Key ${getApiKey()}`,
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const providerMessage =
      body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : `Hedra request failed with status ${response.status}.`;
    throw new Error(providerMessage);
  }
  return body;
}

export function sanitizeStoryAction(value: unknown) {
  if (typeof value !== "string") return null;
  const action = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!action || action.length > 120) return null;
  return action;
}

export function buildStoryInput(action: string, preset: StoryRenderPreset, startImageUrl?: string, sceneContext: string | StoryContinuity = ""): HedraStoryInput {
  const settings = RENDER_PRESETS[preset];
  const memory = typeof sceneContext === "string"
    ? sceneContext
    : sceneContext.previousActions.length
      ? `This is scene ${sceneContext.sceneNumber}. Earlier audience choices, in order: ${sceneContext.previousActions.map((choice, index) => `${Math.max(1, sceneContext.sceneNumber - sceneContext.previousActions.length + index)}. ${choice}`).join("; ")}. These are intentions, not a description of every generated image.`
      : `This is scene ${sceneContext.sceneNumber}, immediately after the opening frame.`;
  const premise = typeof sceneContext === "string" || sceneContext.sceneNumber <= 1 ? STORY_PREMISE : STORY_SEARCH_GOAL;
  return {
    prompt: `Create one continuous ${settings.duration_ms / 1000}-second animated shot, starting exactly from the supplied image. The image is the visual truth: keep Sophie's pose, location, surroundings, props, lighting, and camera direction continuous, even if a prior audience choice suggests something different. ${premise} ${memory ? `${memory} ` : ""}This is one unfolding search, not a fresh start. The audience's new direction is: ${action}. In this shot she visibly attempts that specific action. Let it cause one small, concrete magical response connected to finding her friend. Tell this beat mainly through movement, discovery, and visual consequences rather than repeating dialogue about where her friend is. If the action calls for speech, make it brief and specific to this moment. Show her noticing the response and end on a clear, steady frame that can start the next shot. Do not replay an earlier action, teleport, change rooms without showing the movement, introduce an unrelated character, cut to a new angle, fade to black, or finish on a transition. ${STORY_VISUAL_STYLE} Keep every frame purely 2D. No photorealism, 3D rendering, captions, logos, or on-screen text.`,
    ...(startImageUrl ? {} : { aspect_ratio: "16:9" as const }),
    resolution: settings.resolution,
    duration_ms: settings.duration_ms,
    ...(startImageUrl ? { start_image: { source: "url" as const, url: startImageUrl } } : {}),
  };
}

async function uploadOpeningFrame(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file, "opening-frame-sophie.png");
  const result = await hedraRequest("/files", { method: "POST", body: form }) as { url?: string } | null;
  if (!result || typeof result.url !== "string") throw new Error("Hedra did not return a start-frame URL.");
  return result.url;
}

export async function listHedraModels() {
  return hedraRequest("/models");
}

export async function estimateStoryGeneration(action: string, preset: StoryRenderPreset) {
  return hedraRequest(`/models/${RENDER_PRESETS[preset].model}/estimate`, {
    method: "POST",
    body: JSON.stringify({ input: buildStoryInput(action, preset) }),
  });
}

export async function submitStoryGeneration(action: string, openingFrame: File, preset: StoryRenderPreset, sceneContext: string | StoryContinuity = "") {
  const startImageUrl = await uploadOpeningFrame(openingFrame);
  return hedraRequest(`/models/${RENDER_PRESETS[preset].model}`, {
    method: "POST",
    body: JSON.stringify({ input: buildStoryInput(action, preset, startImageUrl, sceneContext) }),
  });
}

export async function getHedraJob(jobId: string) {
  if (!/^job_[A-Za-z0-9_-]+$/.test(jobId)) throw new Error("Invalid Hedra job id.");
  return hedraRequest(`/jobs/${encodeURIComponent(jobId)}`);
}
