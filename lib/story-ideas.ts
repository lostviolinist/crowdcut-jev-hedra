export type ExistingAudienceIdea = {
  id: string;
  action: string;
};

const ACTION_ALIASES: Array<{ pattern: RegExp; action: string }> = [
  { pattern: /\b(follow|chase|trail|tail|track|go after)\b.*\b(shadow|silhouette|outline|shade)\b/i, action: "Follow his shadow" },
  { pattern: /\b(step|walk|go|head|run|sneak)\b.*\b(inside|into|through)\b|\b(enter|explore)\b.*\b(castle|hall|room|door)\b/i, action: "Enter the castle" },
  { pattern: /\b(ask|talk|speak|tell)\b.*\b(castle|door|walls|house|building)\b/i, action: "Ask the castle for help" },
  { pattern: /\b(call|shout|yell|whisper|say|speak|ask|talk)\b.*\b(friend|him|name|silhouette)\b/i, action: "Call out to her friend" },
  { pattern: /\b(inspect|check|read|study|examine|look for|search)\b.*\b(mark|clue|rune|symbol|writing|footprint|keyhole|trail|crest)\b/i, action: "Search the doorway for clues" },
];

const OFF_TOPIC = /\b(follow my account|subscribe|giveaway|discount code|my wifi|what time is it|brb|what brand|who made this)\b/i;
const ACTION_VERBS = /\b(open|inspect|check|look|leave|run|throw|call|ask|touch|hide|break|move|take|send|wait|record|follow|chase|trail|track|enter|explore|read|pick|push|knock|speak|talk|whisper|shout|listen|sing|climb|step|walk|search|draw|light|offer|hold|sneak|tie|grab)\b/i;

export function normalizeAudienceAction(comment: string, trustActionable = false): string | null {
  const cleaned = comment
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/^\s*(?:sophie\s+should|she\s+should|i\s+(?:think|vote)\s+(?:she\s+should)?|please|make her|have her)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 2 || OFF_TOPIC.test(cleaned)) return null;

  const alias = ACTION_ALIASES.find(({ pattern }) => pattern.test(cleaned));
  if (alias) return alias.action;
  if (!trustActionable && !ACTION_VERBS.test(cleaned)) return null;

  const concise = cleaned
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[!?.,]+$/g, "")
    .split(" ")
    .slice(0, 12)
    .join(" ")
    .slice(0, 96);

  if (!concise) return null;
  return concise.charAt(0).toUpperCase() + concise.slice(1);
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
