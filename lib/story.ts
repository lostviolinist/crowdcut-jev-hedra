export const STORY_TITLE = "The Castle of Shadows";
export const OPENING_FRAME_PATH = "/opening-frame-sophie.png";
export const STORY_PREMISE =
  "Sophie has searched for her long-lost friend for years. His shadows have led her into a magical world, where a walking castle now looms before her. She opens its ornate door and glimpses his silhouette deeper inside. The audience decides what she does next.";
export const STORY_VISUAL_STYLE =
  "2D hand-drawn anime fantasy with hand-painted watercolor backgrounds, warm magical light, expressive linework, and gentle cinematic movement. Sophie is the same young woman in every shot: chestnut-brown hair in a loose high bun with wispy strands, dark green travel cloak over a cream blouse, rust-red scarf, and weathered brown shoulder satchel. Preserve her face, age, hair color, outfit, body proportions, and the moving castle's ornate architecture; never redesign or replace her.";

export function sanitizeSceneContext(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 800);
}
