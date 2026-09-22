// These are raw audience messages. No classification or expected answer is sent to Jev.
const waves = [
  [
    "follow his shadow!!", "Sophie, go after the shadow", "chase that silhouette before it disappears", "his shadow knows where he went", "follow the moving shadow across the bridge", "don't lose the shadow now", "trail the shadow into the castle", "the shadow is literally guiding her", "go where his shadow points", "keep following him", "wait for the shadow and tail it", "run after that shadow!", "follow the shade through the doorway", "the shadow went left, go left", "SOPHIE FOLLOW IT", "stay close to his shadow", "follow his footsteps? no, the shadow", "go after the shadow on the stairs", "her best clue is that shadow", "shadow first, questions later",
  ],
  [
    "the shadow is slipping away, hurry", "track that long shadow", "follow the little shadow trail", "she should chase the dark shape", "go after his silhouette rn", "don't let the shadow vanish", "follow where the light throws his shadow", "the shadow knows the route", "follow it through the hall", "just chase the shadow lol", "Sophie should follow the shadow's path", "go toward the next shadow", "shadow on the wall = follow it", "keep your eyes on that silhouette", "follow the shadows to him", "go where his outline leads", "his shadow crossed the threshold, follow", "tail the shadow quietly", "follow the shape down the corridor", "please follow his shadow",
  ],
  [
    "step inside the castle", "go in!!", "enter the moving castle", "walk through that door", "open the door wider and step in", "she came this far, go inside", "cross the threshold", "go through the glowing doorway", "Sophie needs to enter", "inside the castle, obviously", "walk in before the door closes", "go in and explore", "step into the hall", "enter the castle nowww", "she should go through the door", "take one brave step inside", "get into the castle", "go over the threshold", "walk right through it", "INTO THE CASTLE",
  ],
  [
    "explore the first room", "go deeper inside", "follow the hallway into the castle", "take the spiral stairs", "enter and look around", "walk into the lit corridor", "go find the heart of the castle", "step into the foyer", "keep walking through the castle", "go upstairs once she's inside", "open the inner door", "explore before it starts moving again", "head for that bright archway", "go into the room with the lanterns", "walk past the entrance", "take the passage on the right", "go inside and follow the stairs", "push the second door open", "enter the castle proper", "she should explore inside",
  ],
  [
    "call out his name", "Sophie should shout for her friend", "ask if he's in there", "yell HELLO??", "say his name into the hallway", "call for him before going farther", "please let her call out to him", "try shouting his name", "ask the castle if her friend is there", "call to him from the doorway", "SOPHIE YELL HIS NAME", "she should ask where he is", "maybe he can hear her, call out", "say 'I'm here' to him", "call out and listen for an answer", "shout for her missing friend", "she should speak his name", "ask him to come out", "call after the shadow", "just yell for him!",
  ],
  [
    "whisper his name instead", "call him softly", "ask the shadow where her friend is", "tell him she finally found the castle", "say his name to the shadow", "call for him one more time", "speak to her friend through the door", "ask if he remembers her", "tell him to show himself", "call out, maybe he's nearby", "she should say she's looking for him", "ask the silhouette to answer", "call his name and wait", "whisper that she missed him", "ask her friend to give a sign", "talk to the shadow like it's him", "say 'is that you?'", "call for him from the stairs", "ask the shadow if it belongs to him", "please let her speak to him",
  ],
  [
    "ask the castle what it knows", "talk to the moving castle", "the castle looks alive, speak to it", "ask the door for help", "knock and see if the castle answers", "tell the castle why she's here", "ask the walls where her friend went", "speak to the little door handle", "say hello to the castle first", "ask the castle to stop walking", "can she talk to the castle?", "tell the door to open the right way", "ask the castle for a map", "ask the house if it saw him", "the castle is listening, ask it", "speak to the magic in the walls", "ask those windows for a clue", "talk to the walking building", "ask the castle to lead her to him", "try asking the castle nicely",
  ],
  [
    "inspect the markings on the door", "check the strange symbol on the handle", "look for his initials in the wood", "read that glowing writing", "study the shadow on the floor", "inspect the footprints near the threshold", "look closely at the door's runes", "find a clue before entering", "check the note under the door", "examine the tiny keyhole", "look for a sign he left her", "inspect the moving castle's tracks", "read the words carved into the arch", "check the broken pocket watch", "search the doorway for clues", "look at the shadows carefully", "inspect the crest above the door", "follow the chalk marks", "check whether his scarf is inside", "look for his trail first",
  ],
  [
    "wait for the castle to stop moving", "back away and watch it first", "hide behind the tree", "try the window instead", "climb onto a castle leg", "leave a ribbon so she can find her way back", "grab the door before it walks off", "hold up a mirror to the shadow", "put her ear against the wood", "follow the castle from outside", "throw a pebble through the doorway", "draw the castle before entering", "ask a bird where the shadow went", "tie a rope to the door handle", "step through backwards", "light a lantern to reveal the shadow", "sneak in through the roof", "sing the tune they knew as kids", "offer the castle a flower", "wait until dusk to see more shadows",
  ],
  [
    "omg the art is gorgeous", "what song is this", "her cloak is so cute", "HI CHAT", "first!!!", "anyone else hungry", "this is giving main character energy", "what time is it there", "lol the castle has legs", "please follow my account", "the colors!!!", "can we get a replay", "my wifi is dying", "SOPHIEEEE", "i love this scene", "chat is moving fast", "who made this animation", "the clouds look tasty", "brb making tea", "hello from seattle 👋",
  ],
] as const;

export const demoComments: string[] = Array.from({ length: 10 }, (_, index) =>
  waves.map((wave) => wave[index]),
).flat();

export const demoNames = [
  "mila.mp4", "castlecat", "devon", "peach.wav", "kira.jpg", "mothlight", "rohan", "luna", "alix", "owlhouse", "tess", "marsh", "noah", "violet", "jules", "windmill", "cami", "inkdrop", "sam.g", "teacup",
];

// The continuing stream mixes distinct, story-appropriate ideas with ordinary chat.
// Bare verb phrases let each voice form a grammatical, complete comment.
const continuingActions = [
  "follow the faintest shadow", "ask the castle for a map", "listen at the wall", "trace the runes with her finger",
  "look for her friend's handwriting", "check whether the shadow has a reflection", "follow the sound of footsteps",
  "ask the windows what they have seen", "search for a hidden staircase", "read the notes in the library",
  "try the door with the silver handle", "leave a mark so she can find her way back", "look under the floorboards",
  "wait until the castle changes direction", "ask the clock where it is taking them", "follow the lantern that flickers twice",
  "search for a familiar song", "call her friend by his childhood nickname", "watch where the shadows gather",
  "open the smallest door in the hall", "ask the castle why it keeps walking", "look for a secret in the tapestry",
  "follow the warmth through the corridor", "inspect the little brass key", "ask the mirror what it remembers",
  "look for the room that is missing from the map", "follow the paper birds", "search for his scarf",
  "put her ear to the locked door", "watch the moonlight on the stairs", "ask the door which way is safe",
  "take the stairs that move on their own", "read the message in the dust", "follow the scent of his old coat",
  "look for a second set of footprints", "ask the shadow to wait", "try humming their old song",
  "search the tower for a signal", "follow the trail of falling stars", "check the pocket watch again",
  "ask the castle to show her the truth", "look behind the painted sky", "follow the bell only she can hear",
  "search the kitchen for a clue", "see whether the candles point somewhere", "speak to the portrait on the wall",
  "ask if anyone else is trapped here", "watch what the castle does when she stops", "look through the keyhole first",
  "find out whose shadow is following her", "follow the thread tied to the banister", "search the attic for a letter",
  "ask the wind for her friend's name", "look for a door that wasn't there before", "follow the light beneath the floor",
  "hide and see who comes looking", "inspect the spell on the window", "ask the castle what it wants in return",
  "follow the sound of a music box", "look inside the old suitcase", "search for a path through the roof",
  "wait for the walls to stop shifting", "ask the stars which way he went", "look for a note in the fireplace",
  "follow the handprints on the glass", "open the door with no shadow", "search for the castle's heart",
  "ask the clock to turn back one minute", "follow the sparks into the next room", "look for her friend's initials",
  "let the shadow lead for once", "check whether the castle is protecting him", "find the source of the whispering",
  "ask the walls to repeat what they heard", "follow the staircase down instead", "look for a clue in the stained glass",
];

const suggestionVoices = [
  (action: string) => `maybe she should ${action}`,
  (action: string) => `i vote she should ${action}`,
  (action: string) => `could she ${action}?`,
  (action: string) => `what if she tries to ${action}?`,
  (action: string) => `next move: ${action}`,
  (action: string) => `chat, hear me out: ${action}`,
  (action: string) => `why doesn't she ${action}?`,
  (action: string) => `i'd love to see her ${action}`,
  (action: string) => `she could ${action}...`,
  (action: string) => `no wait, ${action}`,
  (action: string) => `my vote is to ${action}`,
  (action: string) => `let her ${action}`,
  (action: string) => `does anyone else want her to ${action}?`,
  (action: string) => `plot twist: she should ${action}`,
  (action: string) => `i think she needs to ${action}`,
  (action: string) => `${action} maybe?`,
];

const ambientChat = [
  "the castle feels like a character at this point", "I do not trust that place at all", "wait, who built this castle?",
  "this is the kind of story I'd stay up for", "Sophie deserves one good answer", "does anyone else think the castle is hiding something?",
  "the suspense is actually getting me", "this feels like a dream I half remember", "I'm worried for her friend",
  "what if the castle is trying to help?", "okay but what does the castle WANT", "I need a map of this place",
  "the animation is lovely", "chat is moving faster than I can read", "I missed one scene, what happened?",
  "brb getting snacks", "please tell me I'm not the only one nervous", "I keep changing my mind about the shadow",
  "the mystery is getting better", "I would be lost in there in five minutes", "someone remind me what her friend was called",
  "I love the little magical details", "this soundtrack is doing a lot", "there are so many possible paths",
  "I don't think that castle follows normal rules", "the friend had better be okay", "I need a replay of the last scene",
  "this is going to end on a cliffhanger isn't it", "Sophie is braver than me", "I wonder if the castle remembers people",
  "the art style is so cozy and ominous", "I am fully invested now", "what's everyone's theory?",
  "the castle might be leading her somewhere on purpose", "is anyone keeping track of the clues?", "not me overthinking every shadow",
  "I hope she finds him", "is this place even in the same world?", "the lighting in these scenes is gorgeous",
  "anyone else watching with the sound off?", "I really want to know what happens next", "that castle definitely has secrets",
  "this has turned into a proper mystery", "could the shadow be protecting her?", "I would have gone home by now lol",
  "the story is getting stranger", "she must be exhausted by now", "I'm here for the weird castle lore",
  "why do I feel like the walls are listening?", "I keep expecting the castle to answer back",
];

export function makeLiveComment(index: number, sceneIndex: number): string {
  if (index < demoComments.length) return demoComments[index];
  const turn = index - demoComments.length;
  // Roughly one in seven messages is casual chat. Within a visible 80-message
  // window, action phrases do not repeat, and the voice changes independently.
  if (turn % 7 === 0) {
    const ambientNumber = Math.floor(turn / 7);
    return ambientChat[(ambientNumber * 17 + sceneIndex * 5) % ambientChat.length];
  }
  const suggestionNumber = turn - Math.floor(turn / 7) - 1;
  const action = continuingActions[(suggestionNumber * 37 + sceneIndex * 11) % continuingActions.length];
  const voice = suggestionVoices[(suggestionNumber * 7 + Math.floor(suggestionNumber / continuingActions.length) * 5 + sceneIndex * 3) % suggestionVoices.length];
  return voice(action);
}
