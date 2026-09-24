export const MIN_COMMENTS_TO_CHOOSE = 12;
export const MAX_COMMENTS_TO_CHOOSE = 24;

type LeadingIdea = { votes: number; audienceVotes: number };

export function readyToChooseScene(classified: number, leader?: LeadingIdea, runnerUp?: LeadingIdea): boolean {
  if (!leader || classified < MIN_COMMENTS_TO_CHOOSE) return false;
  if (classified >= MAX_COMMENTS_TO_CHOOSE) return true;

  const next = runnerUp ?? { votes: 0, audienceVotes: 0 };
  // A strong early signal can start rendering sooner. Otherwise keep reading
  // until 24 comments have been classified so a scattered chat gets a say.
  return (leader.audienceVotes >= 2 && leader.audienceVotes > next.audienceVotes)
    || (leader.votes >= 4 && leader.votes - next.votes >= 2);
}
