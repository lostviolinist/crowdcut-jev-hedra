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

// Strange ideas are still genuine directions, so Jev can decide whether the
// crowd rallies around them rather than treating all weirdness as off-topic.
const strangeDirections = [
  "swap places with her own shadow", "fold the map into a bird and let it lead",
  "borrow a minute from the castle's clock", "plant the mechanical bird in a flowerpot",
  "open the door painted on the ceiling", "ask the mirror to show what it refuses to reflect",
  "follow the staircase that appears only when her eyes are closed",
  "trade her scarf for the castle's smallest secret", "send a paper moon through the keyhole",
  "listen to the footprints instead of following them", "turn the hallway upside down with the brass dial",
  "hide a message inside the next shadow", "knock on the floor and wait for the sky to answer",
  "ask the clockwork bird to remember her friend's voice", "step into the reflection before it disappears",
  "let the castle choose a door and then take the other one", "wind the rain backward to reveal the path",
  "catch a falling star in the empty teacup", "untie the knot holding the moonlight in place",
  "follow the song coming from an unopened book", "give the castle a name it has never heard",
  "draw a doorway on the wall and try its handle", "ask her future shadow what it is running from",
  "turn the castle's footsteps into a trail of lanterns", "open the suitcase full of yesterday's weather",
  "make the silent door sing before opening it", "follow the upside-down footprints across the roof",
  "read the letter written on the back of the wind", "challenge the mirror to show the real castle",
  "follow the room that keeps arriving one second early",
];

// Live rounds move through different visual possibilities instead of asking
// the castle the same question in slightly different words. These are seeds
// for audience comments, not predefined Jev labels or guaranteed branches.
const cinematicWaves = [
  [
    "step through the door as it changes color", "follow a paper bird into the rafters",
    "turn the door dial to the moon symbol", "catch the glove drifting down the stairs",
    "trace the glowing chalk trail", "climb the staircase hidden behind the fireplace",
    "look for the room reflected in the lantern glass",
  ],
  [
    "ride the staircase while it rearranges itself", "pull the brass lever beneath the floor",
    "crawl under the wall before it slides shut", "jump across the moving floor tiles",
    "mark her route with a ribbon", "follow the corridor that tilts toward the stars",
    "open the trapdoor in the ceiling",
  ],
  [
    "wind up the tiny mechanical bird", "put the singing key into the silent lock",
    "follow the compass that points backward", "unfold the map hidden inside the teacup",
    "hold the mirror up to the empty chair", "open the music box with the missing tune",
    "catch the pocket watch before it falls through the floor",
  ],
  [
    "climb onto the roof above the clouds", "cross the bridge that appears at sunset",
    "follow the falling stars to the next tower", "sail a paper boat across the flooded hallway",
    "jump onto the castle's passing balcony", "chase the lantern floating over the valley",
    "follow the footprints that glow in moonlight",
  ],
  [
    "pin the runaway shadow to the wall with her scarf", "follow the shadow that moves without a person",
    "cast her own shadow across the locked doorway", "step into the place where two shadows meet",
    "use the lantern to reveal the invisible staircase", "watch which way the shadows point at dawn",
    "follow the silhouette that appears in the rain",
  ],
  [
    "step inside the painting of their childhood street", "play the music box to unlock a memory",
    "put the torn photograph back together", "follow the scarf drifting through the library",
    "open the book that writes her name by itself", "walk through the room where yesterday is still happening",
    "catch the paper cranes carrying old messages",
  ],
  [
    "trade one memory for the hidden floor plan", "leave her shadow behind to open the door",
    "give the clock one minute of her future", "offer the castle a secret instead of a question",
    "break the spell on the mirror with the brass key", "choose which of the two identical doors is real",
    "untie the red thread that holds the hallway in place",
  ],
  [
    "follow the mechanical bird before its wings stop", "race the candle flame through the twisting hall",
    "duck into the doorway that keeps running away", "grab the falling map before it burns",
    "chase the echo up the spiral stairs", "follow the train of glowing moths",
    "hide behind the moving tapestry until the footsteps pass",
  ],
  [
    "open the door onto an underwater library", "step into the garden where snow falls upward",
    "cross the midnight market inside the castle", "follow the river flowing through the ceiling",
    "look into the window showing tomorrow", "walk across the bridge made of constellations",
    "enter the room that is larger than the castle",
  ],
  [
    "repair the cracked gear in the castle's heart", "follow the pulse beneath the floorboards",
    "pull the star-shaped switch in the engine room", "catch the spark escaping from the furnace",
    "climb inside the clockwork to reach the upper tower", "turn the wheel that changes the castle's path",
    "use the broken compass to restart the machinery",
  ],
  [
    "open the window where her friend appears only in reflection", "follow the footprints that belong to her future self",
    "lift the curtain hiding a second castle", "step into the room where everyone has vanished",
    "read the letter that changes whenever she blinks", "follow the shadow that has become a doorway",
    "take the hand reaching out of the painted sky",
  ],
  [
    "send a lantern signal from the highest tower", "open the sky door before the storm reaches it",
    "carry the glowing key across the collapsing bridge", "free the paper birds trapped in the clock",
    "follow the thread leading out of the castle", "turn the castle toward the sunrise",
    "step through the final door together with her friend",
  ],
] as const;

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

const irrelevantChat = [
  "my cat just closed all my tabs", "wait is my laundry still in the washer", "what are we having for dinner",
  "I think my keyboard is haunted", "does anyone know why my plant is leaning left", "my toast landed butter-side up today",
  "I just found a sock in the fridge", "is it normal for a pigeon to follow the bus", "sorry I was looking for a soup recipe",
  "I need to buy more dish soap", "can somebody remind me to water the basil", "my dog is watching this upside down",
  "this is not the train timetable is it", "did I leave the oven on", "my phone thinks I am in the ocean",
  "does anyone know where I put my glasses", "the moon looks like a potato tonight", "my neighbor is vacuuming at midnight",
  "quick poll: pancakes or waffles", "I just sneezed and scared my houseplant", "why is my cereal making noise",
  "I think I joined the wrong stream", "does anybody have a good pasta recipe", "the delivery app says my pizza is in a park",
  "my goldfish is judging my life choices", "I forgot what I came into this room for", "who else has seventeen browser tabs open",
  "apparently my fridge has a software update", "I accidentally called my teacher mom today", "I just spilled tea on the TV remote",
  "my umbrella disappeared again", "is a hot dog a sandwich", "there's a tiny moth sitting on my headphones",
  "someone please explain why my printer sings", "what day of the week is it", "I need a new charger",
];

function uniqueComments(comments: string[]): string[] {
  const seen = new Set<string>();
  return comments.filter((comment) => {
    const key = comment.trim().replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const directionDeck = uniqueComments([
  ...demoComments.filter((_, index) => index % waves.length !== waves.length - 1),
  ...continuingActions.flatMap((action) => suggestionVoices.map((voice) => voice(action))),
]);
const chatDeck = uniqueComments([
  ...demoComments.filter((_, index) => index % waves.length === waves.length - 1),
  ...ambientChat,
]);

function shuffled<T>(items: T[], seed: number): T[] {
  const result = [...items];
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

const directions = shuffled(directionDeck, 0x643fe91b);
const chat = shuffled(chatDeck, 0x517a92d1);

const COMMENTS_PER_ROUND = 75;
const secondaryDirections = uniqueComments([
  ...continuingActions,
  ...strangeDirections,
  ...cinematicWaves.flat(),
]);

function liveRoundComments(round: number): string[] {
  const wave = cinematicWaves[(round - 1) % cinematicWaves.length];
  const core = wave.flatMap((action, actionIndex) =>
    Array.from({ length: 4 }, (_, repetition) =>
      suggestionVoices[(round * 7 + actionIndex * 5 + repetition * 11) % suggestionVoices.length](action),
    ),
  );
  // Two ideas get an extra supporter, but most of the chat isn't seven
  // near-identical refrains. Rotate the favored ideas between rounds.
  for (const actionIndex of [round % wave.length, (round + 3) % wave.length]) {
    core.push(suggestionVoices[(round * 7 + actionIndex * 5 + 4 * 11) % suggestionVoices.length](wave[actionIndex]));
  }

  const waveActions = new Set<string>(wave);
  const otherActions = shuffled(
    secondaryDirections.filter((action) => !waveActions.has(action)),
    round * 0x72e31b59,
  ).slice(0, 30);
  const otherIdeas = otherActions.map((action, index) =>
    suggestionVoices[(round * 3 + index * 7) % suggestionVoices.length](action),
  );
  const conversation = shuffled([
    ...shuffled(chat, round * 0x4b8d2f15).slice(0, 7),
    ...shuffled(irrelevantChat, round * 0x5cb90437).slice(0, 8),
  ], round * 0x6d98b71f);

  // Each short stretch has actionable suggestions, varied new directions,
  // and a few reactions. Jev still sees the raw text and decides the groups.
  const ranked = shuffled(core, round * 0x361e9c03);
  const result: string[] = [];
  for (let group = 0; group < 5; group++) {
    result.push(...shuffled([
      ...ranked.slice(group * 6, group * 6 + 6),
      ...otherIdeas.slice(group * 6, group * 6 + 6),
      ...conversation.slice(group * 3, group * 3 + 3),
    ], round * 53 + group * 17));
  }
  return result;
}

let cachedRound = -1;
let cachedComments: string[] = [];

// Every set of 75 indices covers the complete round queue, even if a prior
// round ended early. The ordering changes by round, and text stays unique.
export function makeLiveComment(index: number, round?: number): string {
  if (round !== undefined) {
    if (cachedRound !== round) {
      cachedRound = round;
      cachedComments = liveRoundComments(round);
    }
    return cachedComments[((index % COMMENTS_PER_ROUND) + COMMENTS_PER_ROUND) % COMMENTS_PER_ROUND];
  }
  if (index % 7 === 5) return chat[Math.floor(index / 7) % chat.length];
  return directions[(index - Math.floor((index + 1) / 7)) % directions.length];
}

const handleFirst = ["amber", "orbit", "moss", "pixel", "velvet", "moon", "cinder", "lilac", "paper", "echo", "honey", "cloud", "olive", "maple", "marble", "rune", "tin", "violet", "pebble", "fable", "jelly", "cobalt", "lumen", "fern"];
const handleSecond = ["fox", "moth", "comet", "teacup", "static", "sparrow", "lantern", "noodle", "pocket", "rabbit", "glitch", "harbor", "button", "sprite", "otter", "whisper", "cricket", "aster", "clover", "drift", "signal", "cloud", "beacon", "biscuit"];

export function makeLiveName(index: number, sceneIndex: number): string {
  const serial = sceneIndex * 73 + index * 37;
  const pair = serial % (handleFirst.length * handleSecond.length);
  const first = handleFirst[pair % handleFirst.length];
  const second = handleSecond[Math.floor(pair / handleFirst.length)];
  const suffix = String(Math.floor(serial / (handleFirst.length * handleSecond.length)) % 100).padStart(2, "0");
  switch ((index + sceneIndex) % 4) {
    case 0: return `${first}_${second}`;
    case 1: return `${first}.${second}`;
    case 2: return `${first}${second}${suffix}`;
    default: return `${second}of${first}`;
  }
}
