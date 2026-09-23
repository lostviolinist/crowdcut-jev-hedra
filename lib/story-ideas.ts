export type ExistingAudienceIdea = {
  id: string;
  action: string;
};

const OFF_TOPIC = /\b(follow my account|subscribe|giveaway|discount code|my wifi|what time is it|brb|what brand|who made this)\b/i;
const ACTION_VERBS = /\b(open|inspect|check|look|leave|run|throw|call|ask|touch|hide|break|move|take|send|wait|record|follow|chase|trail|track|enter|explore|read|pick|push|knock|speak|talk|whisper|shout|listen|sing|climb|step|walk|search|draw|light|offer|hold|sneak|tie|grab)\b/i;

// Jev chooses the cluster. Its SDK does not produce a free-text cluster title,
// so turn a new suggestion into a short action without flattening novel ideas
// into a small list of predefined story branches.
export function formatAudienceActionLabel(value: string): string {
  let action = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Remove stream-chat framing, speculation, and character/modal wording.
  // Keep the concrete verb and object: "ask the door" is not automatically
  // relabeled as the much broader "ask the castle for help".
  const prefixes = [
    /^(?:chat|hey chat|okay chat|ok chat|guys|everyone)[,!:\s-]+/i,
    /^(?:what if (?:she|sophie) tries to|my vote is to|no wait)[,!?:\s-]+/i,
    /^(?:hear me out|plot twist|next move|my vote|idea)[!?:,\s-]+/i,
    /^(?:maybe|perhaps|please|honestly|wait|what if)[,!?:\s-]+/i,
    /^(?:does anyone else want|i(?:'d| would)? (?:love|like|want) to see) (?:her|sophie) (?:to )?/i,
    /^(?:i (?:think|vote|say|reckon)(?: that)? (?:she|sophie) (?:should|could|needs to|has to)?\s*)/i,
    /^(?:why (?:doesn'?t|does not|not)|could|can|should|would) (?:she|sophie)\s+/i,
    /^(?:she|sophie) (?:should|could|can|might|needs to|has to|ought to|would)\s+/i,
    /^(?:make|have|let) (?:her|sophie)\s+/i,
    /^(?:try to|let'?s)\s+/i,
  ];
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const prefix of prefixes) {
      const next = action.replace(prefix, "").trim();
      if (next !== action && next) {
        action = next;
        changed = true;
      }
    }
    if (!changed) break;
  }

  action = action
    .replace(/\s*(?:—|–)\s*(?:what do you think|she is so close|right now)\s*$/i, "")
    .replace(/(?:\s*,?\s*(?:maybe|perhaps|please|right now|what do you think))+[!?.\s]*$/i, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[!?.;,\s]+$/g, "");

  // Trim at word boundaries so labels stay scannable in the direction cards.
  const words = action.split(/\s+/).filter(Boolean);
  const concise = words.slice(0, 12).join(" ");
  const bounded = concise.length <= 96 ? concise : concise.slice(0, 96).replace(/\s+\S*$/, "");
  return bounded ? bounded.charAt(0).toUpperCase() + bounded.slice(1) : "";
}

export function normalizeAudienceAction(comment: string, trustActionable = false): string | null {
  if (!comment.trim() || OFF_TOPIC.test(comment)) return null;
  const action = formatAudienceActionLabel(comment);
  if (!action || action.length < 2) return null;
  if (!trustActionable && !ACTION_VERBS.test(action)) return null;
  return action;
}

export function makeIdeaId(action: string) {
  const slug = action
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 54);
  return `idea_${slug || "audience_direction"}`;
}

function actionTokens(value: string) {
  const stopwords = new Set(["a", "an", "and", "for", "her", "it", "of", "someone", "the", "to"]);
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1 && !stopwords.has(token)),
  );
}

export function findClosestIdea(action: string, ideas: ExistingAudienceIdea[]) {
  const target = actionTokens(action);
  let best: { idea: ExistingAudienceIdea; score: number } | null = null;

  for (const idea of ideas) {
    const candidate = actionTokens(idea.action);
    const overlap = [...target].filter((token) => candidate.has(token)).length;
    const union = new Set([...target, ...candidate]).size || 1;
    const score = overlap / union;
    if (!best || score > best.score) best = { idea, score };
  }

  return best && best.score >= 0.45 ? best.idea : null;
}
