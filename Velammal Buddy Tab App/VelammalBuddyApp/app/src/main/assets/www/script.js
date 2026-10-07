/* =========================================================================
   VELAMMAL BUDDY — script.js
   -------------------------------------------------------------------------
   Sections in this file:
     1. SETTINGS            – student name, language, voice, messages
     2. KNOWLEDGE BASE      – ★ EDIT YOUR 10 QUESTIONS AND ANSWERS HERE ★
     3. QUESTION MATCHING   – finds the best answer for what was heard
     4. APP STATE           – remembers what Buddy is doing right now
     5. SCREEN UPDATES      – idle / listening / speaking, status, cards
     6. LISTENING           – browser speech recognition (microphone)
     7. SPEAKING            – browser speech synthesis (voice)
     8. DEMO BACKUP MODE    – hidden panel (CTRL + D or hold the logo)
     9. STARTUP
   ========================================================================= */

"use strict";

/* =========================================================================
   1. SETTINGS
   ========================================================================= */

const STUDENT_NAME = "Gugan";

const CONFIG = {
  // Language used by the microphone. "en-IN" understands Indian English
  // accents best. If listening fails, try "en-US" or "en-GB".
  recognitionLanguage: "en-IN",

  // Buddy's voice. Leave preferredVoiceNames empty to choose automatically.
  // To force a voice, put part of its name here, e.g. ["Heera"] or ["Google UK English Female"].
  // (Open the Demo Backup Mode to see which voice is being used.)
  preferredVoiceNames: [],
  preferredVoiceLanguages: ["en-IN", "en-GB", "en-US"],
  preferOfflineVoice: true,      // offline (built-in) voices are more reliable
  speechRate: 0.95,              // 0.5 = slow, 1 = normal, 1.5 = fast
  speechPitch: 1.1,              // slightly higher = friendlier robot
  speechVolume: 1,

  // Stop one listening round after this many milliseconds
  listeningTimeoutMs: 10000,

  // CONVERSATION MODE: after each answer Buddy starts listening again by
  // itself. Tap the button any time to stop. Set to false for one question per tap.
  keepListening: true,
  keepListeningPauseMs: 600,       // short pause after Buddy speaks, then listen
  stopAfterSilenceMs: 40000,       // stop the conversation after 40 s of silence

  // OFFLINE LISTENING: newer Chrome (139+) can recognise speech on the
  // device, without internet, once an English speech pack is downloaded.
  // "auto" = use it when it is available, otherwise use Google online.
  offlineListening: "auto",        // "auto" | "off"
  offlineLanguages: ["en-IN", "en-US", "en-GB"],

  // Rehearsed mode (see Demo Backup Mode): order of question ids to play
  rehearsedOrder: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 15, 17],
  rehearsedStartDelayMs: 900,    // wait before the question starts appearing
  rehearsedWordDelayMs: 320,     // speed at which the question "types" itself

  // Look and feel
  liteMode: "auto",              // "auto" (lite on slow tablets) | true | false. Also ?lite=1 / ?lite=0
  showSplash: true,              // Velammal splash screen when the app opens
  splashDurationMs: 2800,        // how long the splash shows (tap it to skip)
  thinkingDelayMs: 700,          // "Buddy is thinking..." dots before each answer

  // Everything Buddy says or shows that is not an answer
  messages: {
    idle: `Hi ${STUDENT_NAME}! What would you like to learn today?`,
    listening: "I'm listening...",
    speaking: "Let me explain...",
    noMatch: "That's a great question! I haven't learned that lesson yet. Please ask me another question.",
    notSupported: "Voice listening works in Google Chrome. Please open me in Chrome.",
    micBlocked: "I can't hear you yet. Please allow the microphone and try again.",
    noMic: "I can't find a microphone. Please check that it is connected.",
    noSpeech: "I didn't hear anything. Tap the button and ask me again!",
    network: "I can't listen without internet yet. Please download the offline English pack (see the guide), or turn on Wi-Fi.",
    sessionEnded: "I'll be right here. Tap the button when you want to talk!",
    didNotCatch: "Oops, I didn't catch that. Tap the button and try again!",
    quizTurn: "Your turn! Tap and tell me the answer."
  }
};


/* =========================================================================
   2. KNOWLEDGE BASE  ★ EDIT YOUR QUESTIONS AND ANSWERS HERE ★
   -------------------------------------------------------------------------
   Each question has:
     id         – a unique number (used by the backup mode order)
     category   – shown as a small label in the backup panel
     question   – shown on screen as "Gugan asked:"
     answer     – what Buddy says and shows
     keywords   – words to listen for. Use "|" for words that mean the same,
                  e.g. "sunlight|sun|light" matches any of those words.
                  Plurals are handled automatically (plant = plants).
     minMatches – (optional) how many keywords must be heard.
                  Default is 2 (or 1 if there is only one keyword).

   To ADD a question: copy one { ... } block, paste it, change the text.
   To REPLACE a question: just change the text inside a block.
   ========================================================================= */

const knowledgeBase = [
  {
    id: 1,
    category: "Science",
    question: "Why do plants need sunlight?",
    answer: "Plants need sunlight to make their own food. This process is called photosynthesis. The green leaves use sunlight, water and air to make food, and they give us fresh oxygen to breathe!",
    keywords: ["plant", "sunlight|sun|light", "need|why|food"]
  },
  {
    id: 2,
    category: "English",
    question: "Yesterday I goed to the park and play with my friends. Is this sentence correct?",
    answer: "Almost! The correct sentence is: Yesterday I went to the park and played with my friends. We use went instead of goed, and played instead of play, because you are talking about something that happened yesterday. Great try!",
    keywords: ["goed|go|good|went|gone", "park", "play|played|playing", "friend", "yesterday", "sentence|correct|grammar|right"],
    minMatches: 3
  },
  {
    id: 3,
    category: "Maths",
    question: "What is 7 times 8?",
    answer: "7 times 8 is 56. Here is a fun trick to remember it: 5, 6, 7, 8. So, 56 is 7 times 8!",
    keywords: ["7|seven", "8|eight", "times|multiply|multiplied|multiplication|x|into"],
    minMatches: 3
  },
  {
    id: 4,
    category: "Science",
    question: "Why is the sky blue?",
    answer: "Sunlight has all the colours of the rainbow mixed together. When sunlight enters the air, the blue colour gets scattered all over the sky the most. That is why the sky looks blue during the day!",
    keywords: ["sky", "blue"]
  },
  {
    id: 5,
    category: "English",
    question: "What is a noun?",
    answer: "A noun is a naming word. It names a person, place, animal or thing. For example, teacher, Chennai, dog and book are all nouns!",
    keywords: ["noun|naming word"],
    minMatches: 1
  },
  {
    id: 6,
    category: "General Knowledge",
    question: "Who was the first Prime Minister of India?",
    answer: "Pandit Jawaharlal Nehru was the first Prime Minister of India. He loved children very much, so we celebrate his birthday, November 14th, as Children's Day!",
    keywords: ["prime minister|prime|minister|pm", "first", "india|indian"],
    minMatches: 3
  },
  {
    id: 7,
    category: "Maths",
    question: "How many sides does a triangle have?",
    answer: "A triangle has 3 sides and 3 corners. You can see triangles all around you, like a slice of pizza or the roof of a house!",
    keywords: ["triangle", "side|corner|angle|how many"],
    minMatches: 1
  },
  {
    id: 8,
    category: "General Knowledge",
    question: "How many planets are there in our solar system?",
    answer: "There are 8 planets in our solar system, and they all go around the Sun. Earth is the third planet from the Sun, and it is the only planet we know that has life!",
    keywords: ["planet", "how many|many|solar system|solar"]
  },
  {
    id: 9,
    category: "School Lesson",
    question: "What are the three states of matter?",
    answer: "The three states of matter are solid, liquid and gas. Ice is a solid, water is a liquid, and steam is a gas. Water can change into all three!",
    keywords: ["matter", "state|solid|liquid|gas|three|3"]
  },
  {
    id: 10,
    category: "English",
    question: "What is the opposite of happy?",
    answer: "The opposite of happy is sad. Some other opposite words are big and small, hot and cold, and fast and slow. Can you think of another pair?",
    keywords: ["opposite", "happy"]
  },

  /* ---------------- MY SCHOOL ---------------- */
  {
    id: 11,
    category: "My School",
    question: "Do I have PET period tomorrow?",
    answer: "No, your PET period is on Thursday. Don't forget to wear your sports shoes that day!",
    keywords: ["pet|p e t|pt|p t|physical education|games|sport|sports", "period|class|tomorrow|today|when"]
  },
  {
    id: 12,
    category: "My School",
    question: "Can I get biryani in school?",
    answer: "No, we don't have biryani. But you can get a yummy samosa from the school canteen!",
    keywords: ["biryani|biriyani|briyani|biriani|beriyani|biryan|biriyan"],
    minMatches: 1
  },
  {
    id: 13,
    category: "My School",
    question: "Where can I meet the Western Music sir?",
    answer: "His name is Christy Sir. You can meet him in the Western Music room, near the school fee counter.",
    keywords: ["western music|western|music", "sir|teacher|master|meet|where|room|name"]
  },
  {
    id: 14,
    category: "My School",
    question: "Where is the Health Center in the school?",
    answer: "You can go to the Health Center on the first floor of Block One, near the HM office.",
    keywords: ["health|sick|nurse|doctor|first aid|medical|hurt", "center|centre|room|where|go"]
  },

  /* ---------------- GENERAL KNOWLEDGE (current affairs) ----------------
     Update this answer if the Chief Minister changes. */
  {
    id: 16,
    category: "General Knowledge",
    question: "Who is the Chief Minister of Tamil Nadu?",
    answer: "The Chief Minister of Tamil Nadu is Thiru C. Joseph Vijay. He became the Chief Minister on the 10th of May, 2026.",
    keywords: ["chief minister|chief|cm|c m", "tamil nadu|tamilnadu|tamil|nadu"]
  },

  /* ---------------- GOODBYE ----------------
     action: "goodbye" = Buddy says goodbye, waves and stops listening. */
  {
    id: 17,
    category: "Goodbye",
    question: "Goodbye, Buddy!",
    action: "goodbye",
    answer: "Goodbye Gugan! It was so much fun learning with you today. See you soon!",
    keywords: ["goodbye|good bye|bye|bye bye|byebye|see you|see ya|good night|goodnight|tata|ta ta|talk to you later"],
    minMatches: 1
  },

  /* ---------------- MATHS QUIZ ----------------
     action: "quiz" starts the interactive quiz (questions are in section 2B). */
  {
    id: 15,
    category: "Maths Quiz",
    question: "Can you give me a maths quiz?",
    action: "quiz",
    answer: "",
    keywords: ["quiz|quizzes|test me|maths test|math test|mathematics test"],
    minMatches: 1
  }
];


/* =========================================================================
   2B. MATHS QUIZ  ★ EDIT QUIZ QUESTIONS HERE ★
   -------------------------------------------------------------------------
   When Gugan asks for a quiz, Buddy asks QUIZ_LENGTH questions, one at a
   time. Gugan taps Talk and says the number. Buddy says if it is right,
   explains the answer, and gives a score at the end.
   Each new quiz continues with the next questions in this list.
   ========================================================================= */

const QUIZ_LENGTH = 3;

const quizQuestions = [
  { question: "What is 6 plus 4?",  answer: 10, explain: "6 plus 4 makes 10." },
  { question: "What is 9 minus 3?", answer: 6,  explain: "If you take 3 away from 9, you get 6." },
  { question: "What is 3 times 4?", answer: 12, explain: "3 groups of 4 make 12." },
  { question: "What is 15 minus 7?", answer: 8, explain: "15 take away 7 leaves 8." },
  { question: "What is 20 divided by 4?", answer: 5, explain: "20 shared equally into 4 groups gives 5 in each group." },
  { question: "What is 7 plus 8?",  answer: 15, explain: "7 plus 8 makes 15." }
];


/* =========================================================================
   3. QUESTION MATCHING
   -------------------------------------------------------------------------
   Speech recognition never returns exactly the same sentence, so we do not
   compare whole sentences. Instead we:
     1. clean the text (lowercase, remove punctuation)
     2. simplify plurals ("plants" -> "plant")
     3. count how many of each question's keywords were heard
     4. pick the question with the best score
   ========================================================================= */

/** Lowercase, turn symbols into words, strip punctuation. */
function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[×✕*]/g, " times ")
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Very small "stemmer": makes plurals look like the singular word. */
function stemWord(word) {
  if (word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (/(ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

/** Converts text to " word word word " so we can search whole words only. */
function toMatchable(text) {
  const words = normalizeText(text).split(" ").filter(Boolean).map(stemWord);
  return " " + words.join(" ") + " ";
}

/** True if any alternative of a keyword ("sun|sunlight") appears in the input. */
function keywordMatches(matchableInput, keyword) {
  return keyword.split("|").some(function (alternative) {
    const target = toMatchable(alternative);
    return target.trim().length > 0 && matchableInput.includes(target);
  });
}

/** Returns the best matching knowledgeBase item, or null if nothing matches. */
function findBestAnswer(spokenText) {
  const input = toMatchable(spokenText);
  if (!input.trim()) return null;

  let bestItem = null;
  let bestScore = 0;

  knowledgeBase.forEach(function (item) {
    // A (nearly) exact question always wins
    if (input.includes(toMatchable(item.question))) {
      if (100 > bestScore) { bestItem = item; bestScore = 100; }
      return;
    }

    const keywords = item.keywords || [];
    if (keywords.length === 0) return;

    const matched = keywords.filter(function (k) { return keywordMatches(input, k); }).length;
    const needed = item.minMatches || Math.min(2, keywords.length);
    if (matched < needed) return;

    // More keywords matched = better. Ties go to the question whose
    // keywords were matched most completely.
    const score = matched + matched / keywords.length;
    if (score > bestScore) { bestItem = item; bestScore = score; }
  });

  return bestItem;
}

/** Splits an answer into sentences so long answers are spoken reliably. */
function splitIntoSentences(text) {
  const parts = String(text).match(/[^.!?]+[.!?]*/g) || [String(text)];
  return parts.map(function (s) { return s.trim(); }).filter(Boolean);
}

/** Rough speaking time for a piece of text, in milliseconds. */
function estimateSpeechMs(text) {
  const words = String(text).split(/\s+/).filter(Boolean).length;
  return Math.max(1500, (words * 430) / CONFIG.speechRate);
}

/* Number words so "ten", "twenty five" or "10" are all understood in the quiz. */
const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100
};
/* Words speech recognition often hears instead of a short number */
const NUMBER_SOUNDALIKES = { to: 2, too: 2, for: 4, ate: 8, won: 1, tree: 3 };

/** Returns the first number said in the text (e.g. "the answer is twelve" -> 12), or null. */
function parseSpokenNumber(text) {
  const words = normalizeText(text).replace(/-/g, " ").split(" ").filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/^\d+$/.test(w)) return parseInt(w, 10);
    if (NUMBER_WORDS.hasOwnProperty(w)) {
      let value = NUMBER_WORDS[w];
      const next = words[i + 1];
      if (value >= 20 && value < 100 && next && NUMBER_WORDS.hasOwnProperty(next) && NUMBER_WORDS[next] < 10) {
        value += NUMBER_WORDS[next];                  // "twenty five" -> 25
      }
      return value;
    }
  }
  // Very short replies like "ate" or "for" are probably a number
  if (words.length <= 2) {
    for (let i = 0; i < words.length; i++) {
      if (NUMBER_SOUNDALIKES.hasOwnProperty(words[i])) return NUMBER_SOUNDALIKES[words[i]];
    }
  }
  return null;
}




/* =========================================================================
   4. APP STATE
   ========================================================================= */

const state = {
  mode: "idle",                 // "idle" | "listening" | "speaking"
  recognition: null,
  recognitionSupported: false,
  isListening: false,
  gotFinalResult: false,
  lastTranscript: "",
  listenTimer: null,

  speakSession: 0,              // increases every time speech starts/stops
  currentUtterance: null,       // kept to avoid a Chrome bug that drops speech
  speakWatchdog: null,
  thinkTimer: null,
  chosenVoice: null,
  speechWarmedUp: false,

  liveMsgEl: null,              // Gugan's bubble while he is still speaking
  thinkingEl: null,             // Buddy's "typing..." bubble
  currentAnswerEl: null,        // Buddy's answer bubble being spoken

  statusResetTimer: null,
  devOpen: false,

  rehearsedMode: false,
  rehearsedIndex: 0,
  rehearsedSession: 0,
  rehearsedTimer: null,
  rehearsedItem: null,

  lastKidEl: null,              // Gugan's most recent chat bubble

  conversationOn: false,        // true = keep listening after each answer
  silenceSince: 0,              // when the current quiet period started
  silentRestart: false,         // Chrome said "no speech" — listen again quietly
  listenAgainTimer: null,

  localListening: false,        // on-device (offline) recognition is ready
  localLang: "",
  localStatus: "checking",      // checking | ready | downloadable | downloading | unavailable | unsupported
  lite: false,

  quiz: {
    active: false,
    questions: [],              // the questions in the current quiz
    index: 0,                   // which question we are on
    score: 0,
    nextPoolPosition: 0         // the next quiz starts from here in quizQuestions
  }
};

const els = {};   // screen elements, filled in by init()


/* =========================================================================
   5. SCREEN UPDATES
   ========================================================================= */

const BUTTON_LABELS = {
  idle: "Tap to Talk",
  listening: "Listening... tap to stop",
  speaking: "Tap to stop"
};
const PILL_LABELS = { idle: "Online", listening: "Listening", speaking: "Speaking" };

function idlePillText() {
  if (navigator.onLine) return "Online";
  return state.localListening ? "Offline" : "No internet";
}

/** Switch the robot between idle / listening / speaking. */
function setMode(mode, statusMessage, isError) {
  state.mode = mode;
  document.body.dataset.state = mode;
  clearTimeout(state.statusResetTimer);
  document.body.classList.toggle("quiz-active", state.quiz.active);

  const inQuiz = state.quiz.active && mode === "idle";
  setStatus(statusMessage || (inQuiz ? CONFIG.messages.quizTurn : CONFIG.messages[mode]), isError);

  const label = inQuiz ? "Tap to Answer" : BUTTON_LABELS[mode];
  els.talkLabel.textContent = label;
  els.talkButton.setAttribute("aria-label", label);
  els.pillText.textContent = state.quiz.active
    ? "Quiz " + Math.min(state.quiz.index + 1, state.quiz.questions.length) + "/" + state.quiz.questions.length
    : (mode === "idle" ? idlePillText() : PILL_LABELS[mode]);
  document.body.classList.toggle("conversation-on", state.conversationOn);
}

function setStatus(message, isError) {
  els.statusText.textContent = message;
  els.statusBubble.classList.toggle("is-error", !!isError);
  restartAnimation(els.statusBubble, "pop");
}

/** Show a friendly problem message, then go back to the greeting. */
function showFriendlyError(message) {
  endConversation();
  discardLiveMessage();
  setMode("idle", message, true);
  state.statusResetTimer = setTimeout(function () {
    if (state.mode === "idle") setStatus(CONFIG.messages.idle, false);
  }, 6000);
}

function restartAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;          // forces the browser to restart the animation
  element.classList.add(className);
}

/* ---------------- Chat thread ----------------
   Every question and answer is added to the chat and stays there until the
   page is refreshed. Nothing is saved anywhere else.                       */

const BOT_AVATAR_SVG =
  '<svg viewBox="0 0 40 40" aria-hidden="true">' +
  '<line x1="20" y1="9" x2="20" y2="4" stroke="#fff" stroke-width="2" stroke-linecap="round"/>' +
  '<circle cx="20" cy="4" r="2.6" fill="#f5b800"/>' +
  '<rect x="6" y="9" width="28" height="23" rx="9" fill="#fff"/>' +
  '<rect x="10" y="13" width="20" height="14" rx="6" fill="#1e2a4a"/>' +
  '<circle cx="16" cy="20" r="2.6" fill="#5ef0ff"/><circle cx="24" cy="20" r="2.6" fill="#5ef0ff"/>' +
  '</svg>';

function timeNow() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function startChatIfNeeded() {
  if (document.body.classList.contains("has-conversation")) return;
  document.body.classList.add("has-conversation");
  if (!els.chat.querySelector(".chat-day")) {
    const day = document.createElement("div");
    day.className = "chat-day";
    day.textContent = "Today";
    els.chat.appendChild(day);
  }
}

/** If the chat has no messages (e.g. the first question failed), show the big robot again. */
function endChatIfEmpty() {
  if (!els.chat.querySelector(".msg")) {
    document.body.classList.remove("has-conversation");
    els.chat.textContent = "";
  }
}

function scrollChatToBottom() {
  requestAnimationFrame(function () {
    els.chat.scrollTo({ top: els.chat.scrollHeight, behavior: "smooth" });
  });
}

/** Creates an empty chat bubble. kind = "kid" or "bot". */
function createMessage(kind) {
  startChatIfNeeded();

  const row = document.createElement("div");
  row.className = "msg msg-" + kind;

  const avatar = document.createElement("div");
  avatar.className = "avatar " + kind;
  avatar.setAttribute("aria-hidden", "true");
  if (kind === "bot") avatar.innerHTML = BOT_AVATAR_SVG;
  else avatar.textContent = STUDENT_NAME.charAt(0).toUpperCase();

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const text = document.createElement("p");
  text.className = "text";
  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = (kind === "bot" ? "Buddy" : STUDENT_NAME) + " • " + timeNow();
  bubble.append(text, meta);

  if (kind === "bot") row.append(avatar, bubble);
  else row.append(bubble, avatar);

  els.chat.appendChild(row);
  scrollChatToBottom();
  return row;
}

/** Gugan's bubble that fills in live while he speaks. */
function startLiveKidMessage() {
  if (state.liveMsgEl) { state.liveMsgEl.remove(); state.liveMsgEl = null; }
  const row = createMessage("kid");
  row.classList.add("live");
  row.querySelector(".text").innerHTML = '<span class="listen-dots"><i></i><i></i><i></i></span>';
  state.liveMsgEl = row;
}

function updateLiveKidMessage(text) {
  if (!state.liveMsgEl) startLiveKidMessage();
  state.liveMsgEl.querySelector(".text").textContent = text;
  scrollChatToBottom();
}

/** Turns the live bubble (or a new one) into Gugan's final question. */
function commitKidMessage(text) {
  let row = state.liveMsgEl;
  state.liveMsgEl = null;
  if (!row) row = createMessage("kid");
  row.classList.remove("live");
  row.querySelector(".text").textContent = text;
  row.querySelector(".meta").textContent = STUDENT_NAME + " • " + timeNow();
  state.lastKidEl = row;
  scrollChatToBottom();
  return row;
}

/** Removes the live bubble if listening did not produce a question. */
function discardLiveMessage() {
  if (state.liveMsgEl) {
    state.liveMsgEl.remove();
    state.liveMsgEl = null;
  }
  endChatIfEmpty();
}

function showThinking() {
  removeThinking();
  const row = createMessage("bot");
  row.classList.add("typing");
  row.querySelector(".text").innerHTML = '<span class="typing-dots"><i></i><i></i><i></i></span>';
  row.querySelector(".meta").textContent = "Buddy is thinking…";
  state.thinkingEl = row;
}

function removeThinking() {
  if (state.thinkingEl) {
    state.thinkingEl.remove();
    state.thinkingEl = null;
  }
}

function addBotMessage(sentences) {
  const row = createMessage("bot");
  row.classList.add("speaking");
  const text = row.querySelector(".text");
  sentences.forEach(function (sentence, index) {
    const span = document.createElement("span");
    span.className = "sentence";
    span.dataset.index = String(index);
    span.textContent = sentence + " ";
    text.appendChild(span);
  });
  state.currentAnswerEl = row;
  scrollChatToBottom();
  return row;
}

function highlightSentence(activeIndex) {
  if (!state.currentAnswerEl) return;
  state.currentAnswerEl.querySelectorAll(".sentence").forEach(function (span, index) {
    span.classList.toggle("is-active", index === activeIndex);
    span.classList.toggle("is-done", index < activeIndex);
  });
}

function markAllSentencesDone() {
  if (!state.currentAnswerEl) return;
  state.currentAnswerEl.classList.remove("speaking");
  state.currentAnswerEl.querySelectorAll(".sentence").forEach(function (span) {
    span.classList.remove("is-active");
    span.classList.add("is-done");
  });
}


/* =========================================================================
   6. LISTENING (speech recognition)
   ========================================================================= */

function setupRecognition() {
  const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionClass) {
    state.recognitionSupported = false;
    console.warn("Speech recognition is not supported in this browser.");
    return;
  }

  const recognition = new SpeechRecognitionClass();
  recognition.lang = CONFIG.recognitionLanguage;
  recognition.continuous = false;      // one question at a time
  recognition.interimResults = true;   // show words live while Gugan speaks
  recognition.maxAlternatives = 3;     // extra guesses help matching

  recognition.onstart = function () {
    state.isListening = true;
  };

  recognition.onresult = function (event) {
    if (state.mode !== "listening") return;

    let transcript = "";
    let isFinal = false;
    const alternatives = [];

    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      transcript += result[0].transcript;
      if (result.isFinal) {
        isFinal = true;
        for (let j = 0; j < result.length; j++) alternatives.push(result[j].transcript);
      }
    }

    transcript = transcript.trim();
    if (!transcript) return;
    state.lastTranscript = transcript;
    updateLiveKidMessage(transcript);

    if (isFinal && !state.gotFinalResult) {
      state.gotFinalResult = true;
      stopListening();
      handleQuestion(transcript, alternatives);
    }
  };

  recognition.onerror = function (event) {
    console.warn("Speech recognition error:", event.error);
    clearTimeout(state.listenTimer);
    if (state.mode !== "listening") return;   // already moved on

    switch (event.error) {
      case "no-speech":
        // In conversation mode just listen again (handled in onend)
        if (state.conversationOn) state.silentRestart = true;
        else showFriendlyError(CONFIG.messages.noSpeech);
        break;
      case "audio-capture":
        showFriendlyError(CONFIG.messages.noMic); break;
      case "not-allowed":
      case "service-not-allowed":
        showFriendlyError(CONFIG.messages.micBlocked); break;
      case "network":
        // No internet: switch to on-device listening if it is ready
        if (state.localListening && !recognition.processLocally) {
          useLocalRecognition(true);
          state.silentRestart = true;
        } else {
          showFriendlyError(CONFIG.messages.network);
        }
        break;
      case "language-not-supported":
        if (recognition.processLocally) {
          useLocalRecognition(false);           // go back to online listening
          state.localListening = false;
          state.localStatus = "unavailable";
          saveOfflineLang("");
        } else {
          recognition.lang = "en-US";           // fall back to US English next time
        }
        showFriendlyError(CONFIG.messages.didNotCatch); break;
      case "aborted":
        break;                                  // we stopped it ourselves
      default:
        showFriendlyError(CONFIG.messages.didNotCatch);
    }
  };

  recognition.onend = function () {
    state.isListening = false;
    clearTimeout(state.listenTimer);
    if (state.mode !== "listening") return;     // answer or error already handled

    if (!state.gotFinalResult && state.lastTranscript) {
      // Chrome sometimes ends without a "final" result — use what we heard
      state.gotFinalResult = true;
      handleQuestion(state.lastTranscript, [state.lastTranscript]);
    } else if (!state.gotFinalResult) {
      if (state.conversationOn || state.silentRestart) {
        listenAgainQuietly();
      } else {
        showFriendlyError(CONFIG.messages.noSpeech);
      }
    }
  };

  state.recognition = recognition;
  state.recognitionSupported = true;
  loadOfflineListeningState();
}

/* ---------------- Offline (on-device) listening ---------------- */

/** Turns on-device recognition on or off for the next listening round. */
function useLocalRecognition(on) {
  if (!state.recognition) return;
  try {
    state.recognition.processLocally = !!on;
    state.recognition.lang = on ? state.localLang : CONFIG.recognitionLanguage;
  } catch (ignore) { /* older Chrome */ }
}

/* Chrome's "is offline listening available?" check is new and can freeze
   or crash the page in some Chrome versions. So Buddy NEVER runs it by
   himself: it only runs when you tap "Set up offline listening" in the
   backup panel. If it works once, the result is remembered on this device
   and Buddy uses offline listening automatically when the internet is off. */

const OFFLINE_KEY = "velammalBuddy.offlineLang";

function readSavedOfflineLang() {
  try { return localStorage.getItem(OFFLINE_KEY) || ""; } catch (e) { return ""; }
}
function saveOfflineLang(lang) {
  try {
    if (lang) localStorage.setItem(OFFLINE_KEY, lang);
    else localStorage.removeItem(OFFLINE_KEY);
  } catch (e) { /* storage not available */ }
}

/** At start-up: only reads what was saved earlier. Never calls Chrome's check. */
function loadOfflineListeningState() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const saved = readSavedOfflineLang();
  if (CONFIG.offlineListening === "off" || !SR) {
    state.localStatus = "unsupported";
  } else if (saved) {
    state.localListening = true;
    state.localLang = saved;
    state.localStatus = "ready";
  } else if (typeof SR.available === "function") {
    state.localStatus = "not-checked";
  } else {
    state.localStatus = "unsupported";
  }
  updateDevInfo();
}

/** Gives up on a Chrome promise that never answers. */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(function (resolve, reject) { setTimeout(function () { reject(new Error("timeout")); }, ms); })
  ]);
}

/** Runs only when the "Set up offline listening" button is tapped. */
function setupOfflineListening() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR || typeof SR.available !== "function") {
    state.localStatus = "unsupported"; updateDevInfo(); return;
  }
  state.localStatus = "checking"; updateDevInfo();
  const langs = CONFIG.offlineLanguages.slice();
  let downloadLang = "";

  function finishReady(lang) {
    state.localListening = true;
    state.localLang = lang;
    state.localStatus = "ready";
    saveOfflineLang(lang);
    updateDevInfo();
    if (state.mode === "idle") setMode("idle");
  }

  function tryDownload() {
    if (!downloadLang || typeof SR.install !== "function") {
      state.localStatus = "unavailable"; updateDevInfo(); return;
    }
    state.localStatus = "downloading"; updateDevInfo();
    withTimeout(Promise.resolve().then(function () { return SR.install({ langs: [downloadLang] }); }), 180000)
      .then(function (ok) {
        if (ok) finishReady(downloadLang);
        else { state.localStatus = "unavailable"; updateDevInfo(); }
      })
      .catch(function () { state.localStatus = "unavailable"; updateDevInfo(); });
  }

  function tryNext() {
    if (!langs.length) { tryDownload(); return; }
    const lang = langs.shift();
    withTimeout(Promise.resolve().then(function () {
      return SR.available({ langs: [lang], processLocally: true });
    }), 8000)
      .then(function (result) {
        if (result === "available") { finishReady(lang); return; }
        if ((result === "downloadable" || result === "downloading") && !downloadLang) downloadLang = lang;
        tryNext();
      })
      .catch(function () { tryNext(); });
  }
  tryNext();
}

/* ---------------- Conversation mode ---------------- */

function startConversation() {
  state.conversationOn = CONFIG.keepListening && !state.rehearsedMode;
  state.silenceSince = Date.now();
}

function endConversation() {
  state.conversationOn = false;
  state.silentRestart = false;
  clearTimeout(state.listenAgainTimer);
  document.body.classList.remove("conversation-on");
}

/** After Buddy finishes an answer, start listening again by himself. */
function continueConversation() {
  if (!state.conversationOn || state.rehearsedMode || state.devOpen || document.hidden) return;
  clearTimeout(state.listenAgainTimer);
  state.listenAgainTimer = setTimeout(function () {
    if (!state.conversationOn || state.mode !== "idle") return;
    state.silenceSince = Date.now();
    startListening();
  }, CONFIG.keepListeningPauseMs);
}

/** Nobody spoke: keep listening, unless it has been quiet for a long time. */
function listenAgainQuietly() {
  state.silentRestart = false;
  if (!state.conversationOn || Date.now() - state.silenceSince > CONFIG.stopAfterSilenceMs) {
    endConversation();
    discardLiveMessage();
    setMode("idle", CONFIG.messages.sessionEnded);
    return;
  }
  clearTimeout(state.listenAgainTimer);
  state.listenAgainTimer = setTimeout(function () {
    if (state.mode !== "listening") return;
    state.gotFinalResult = false;
    state.lastTranscript = "";
    try { state.recognition.start(); } catch (ignore) { /* already running */ }
    armListenTimer();
  }, 250);
}

function armListenTimer() {
  clearTimeout(state.listenTimer);
  state.listenTimer = setTimeout(function () {
    if (state.mode === "listening") stopListening();
  }, CONFIG.listeningTimeoutMs);
}

function startListening() {
  if (!state.recognitionSupported) {
    showFriendlyError(CONFIG.messages.notSupported);
    return;
  }
  if (state.mode === "listening") return;       // never start twice

  // Use on-device listening when there is no internet
  if (state.localListening) useLocalRecognition(!navigator.onLine);

  stopSpeaking();                                // never listen and talk together
  state.gotFinalResult = false;
  state.lastTranscript = "";
  state.silentRestart = false;
  setMode("listening");
  startLiveKidMessage();

  try {
    state.recognition.start();
  } catch (error) {
    // "InvalidStateError": the previous session had not fully closed yet
    console.warn("Recognition start failed, retrying:", error);
    try { state.recognition.abort(); } catch (ignore) { /* nothing to do */ }
    setTimeout(function () {
      if (state.mode !== "listening") return;
      try { state.recognition.start(); }
      catch (secondError) { showFriendlyError(CONFIG.messages.didNotCatch); }
    }, 300);
  }

  armListenTimer();
}

function stopListening() {
  clearTimeout(state.listenTimer);
  if (!state.recognition) return;
  try { state.recognition.stop(); } catch (ignore) { /* already stopped */ }
}

function abortListening() {
  clearTimeout(state.listenTimer);
  if (!state.recognition) return;
  try { state.recognition.abort(); } catch (ignore) { /* already stopped */ }
}

/** Find the answer for what was heard (tries every guess the browser gave). */
function handleQuestion(transcript, alternatives) {
  const candidates = (alternatives || []).concat([transcript]).filter(Boolean);
  let match = null;
  let shownText = transcript;

  for (let i = 0; i < candidates.length; i++) {
    const found = findBestAnswer(candidates[i]);
    if (found) { match = found; shownText = candidates[i]; break; }
  }

  shownText = shownText.trim();
  commitKidMessage(shownText.charAt(0).toUpperCase() + shownText.slice(1));

  // "Goodbye" always ends the conversation, even in the middle of a quiz
  const goodbye = candidates.some(function (c) {
    const found = findBestAnswer(c);
    return found && found.action === "goodbye";
  });
  if (goodbye) {
    state.quiz.active = false;
    respondToItem(knowledgeBase.find(function (q) { return q.action === "goodbye"; }));
    return;
  }

  // During a quiz, what Gugan says is his answer
  if (state.quiz.active) {
    handleQuizAnswer(candidates);
    return;
  }
  respondToItem(match);
}

/** Buddy replies to a matched question (or says he hasn't learned it yet). */
function respondToItem(item) {
  if (!item) { speakAnswer(CONFIG.messages.noMatch); return; }
  if (item.action === "quiz") { startQuiz(); return; }
  if (item.action === "goodbye") { sayGoodbye(item.answer); return; }
  speakAnswer(item.answer);
}

/** Buddy waves, says goodbye and stops listening until the button is tapped again. */
function sayGoodbye(text) {
  endConversation();
  state.quiz.active = false;
  document.body.classList.remove("waving");
  void document.body.offsetWidth;
  document.body.classList.add("waving");
  setTimeout(function () { document.body.classList.remove("waving"); }, 2600);
  speakAnswer(text);
}


/* =========================================================================
   6B. MATHS QUIZ
   ========================================================================= */

function startQuiz() {
  const quiz = state.quiz;
  quiz.questions = [];
  for (let i = 0; i < Math.min(QUIZ_LENGTH, quizQuestions.length); i++) {
    quiz.questions.push(quizQuestions[(quiz.nextPoolPosition + i) % quizQuestions.length]);
  }
  quiz.nextPoolPosition = (quiz.nextPoolPosition + quiz.questions.length) % quizQuestions.length;
  quiz.index = 0;
  quiz.score = 0;
  quiz.active = true;

  speakAnswer(
    "Yes! Let's do a maths quiz. I will ask you " + quiz.questions.length + " questions. " +
    "Question 1: " + quiz.questions[0].question
  );
}

/** Checks Gugan's answer, then asks the next question or gives the score. */
function handleQuizAnswer(candidates) {
  const quiz = state.quiz;
  const current = quiz.questions[quiz.index];
  const joined = candidates.join(" ");

  // "stop the quiz" / "I want to stop"
  if (/\b(stop|quit|exit|finish|end)\b/i.test(joined)) {
    quiz.active = false;
    speakAnswer("Okay, we stopped the quiz. You got " + quiz.score + " out of " + quiz.index + ". You can ask me for a quiz any time!");
    return;
  }

  let number = null;
  for (let i = 0; i < candidates.length && number === null; i++) number = parseSpokenNumber(candidates[i]);

  if (number === null) {
    // Not a number — maybe Gugan asked a normal question instead
    const match = findBestAnswer(joined);
    if (match && match.action !== "quiz") {
      quiz.active = false;
      speakAnswer("Let's pause the quiz. " + match.answer);
      return;
    }
    speakAnswer("Hmm, I didn't hear a number. " + current.question);
    return;
  }

  let reply;
  if (number === current.answer) {
    quiz.score++;
    if (state.lastKidEl) state.lastKidEl.classList.add("correct");
    reply = pick(["Correct! ", "Well done, that's right! ", "Super! You got it! "]) + current.explain;
  } else {
    reply = "Good try! The answer is " + current.answer + ". " + current.explain;
  }

  quiz.index++;
  if (quiz.index < quiz.questions.length) {
    reply += " Question " + (quiz.index + 1) + ": " + quiz.questions[quiz.index].question;
    speakAnswer(reply);
    return;
  }

  // Quiz finished
  quiz.active = false;
  const total = quiz.questions.length;
  if (quiz.score === total) {
    reply += " Quiz finished! You got " + quiz.score + " out of " + total + ". You are a maths star, " + STUDENT_NAME + "!";
    celebrate();
  } else if (quiz.score > 0) {
    reply += " Quiz finished! You got " + quiz.score + " out of " + total + ". Great effort! Practice makes perfect.";
  } else {
    reply += " Quiz finished! Let's practise together and try again soon. You can do it!";
  }
  speakAnswer(reply);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/** Confetti burst for a perfect quiz score. */
function celebrate() {
  const colours = ["#f5b800", "#4f46e5", "#10b981", "#ec4899", "#06b6d4", "#f97316"];
  const layer = document.createElement("div");
  layer.className = "confetti";
  layer.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement("i");
    piece.style.left = Math.random() * 100 + "%";
    piece.style.background = colours[i % colours.length];
    piece.style.animationDelay = (Math.random() * 0.8 + 0.6) + "s";
    piece.style.animationDuration = (2.2 + Math.random() * 1.4) + "s";
    piece.style.transform = "rotate(" + Math.floor(Math.random() * 360) + "deg)";
    layer.appendChild(piece);
  }
  document.getElementById("app").appendChild(layer);
  setTimeout(function () { layer.remove(); }, 5200);
}


/* =========================================================================
   7. SPEAKING (speech synthesis)
   ========================================================================= */

function loadVoices() {
  if (!("speechSynthesis" in window)) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  state.chosenVoice = chooseVoice(voices);
  updateDevInfo();
}

function chooseVoice(voices) {
  // 1. A voice named in the settings
  for (let i = 0; i < CONFIG.preferredVoiceNames.length; i++) {
    const wanted = CONFIG.preferredVoiceNames[i].toLowerCase();
    const found = voices.find(function (v) { return v.name.toLowerCase().includes(wanted); });
    if (found) return found;
  }

  const english = voices.filter(function (v) { return /^en/i.test(v.lang); });
  const langOf = function (v) { return v.lang.replace("_", "-").toLowerCase(); };
  const passes = CONFIG.preferOfflineVoice ? [true, false] : [false];

  // 2. Preferred languages (offline voices first)
  for (let p = 0; p < passes.length; p++) {
    for (let l = 0; l < CONFIG.preferredVoiceLanguages.length; l++) {
      const lang = CONFIG.preferredVoiceLanguages[l].toLowerCase();
      const found = english.find(function (v) {
        return langOf(v).startsWith(lang) && (!passes[p] || v.localService);
      });
      if (found) return found;
    }
  }

  // 3. Any English voice, then anything
  return english.find(function (v) { return v.localService; }) || english[0] || voices[0] || null;
}

function applyVoice(utterance) {
  if (state.chosenVoice) {
    utterance.voice = state.chosenVoice;
    utterance.lang = state.chosenVoice.lang;
  } else {
    utterance.lang = "en-IN";
  }
  utterance.rate = CONFIG.speechRate;
  utterance.pitch = CONFIG.speechPitch;
  utterance.volume = CONFIG.speechVolume;
}

/** Some browsers only allow speech after a tap — "wake up" the voice on the first tap. */
function warmUpSpeech() {
  if (state.speechWarmedUp || !("speechSynthesis" in window)) return;
  state.speechWarmedUp = true;
  try {
    const silent = new SpeechSynthesisUtterance(" ");
    silent.volume = 0;
    window.speechSynthesis.speak(silent);
  } catch (ignore) { /* not important */ }
}

/** Buddy "thinks" for a moment, then adds his answer to the chat and speaks it. */
function speakAnswer(text) {
  stopSpeaking();                                  // stop any earlier answer first
  const session = ++state.speakSession;
  const sentences = splitIntoSentences(text);

  setMode("speaking");
  showThinking();

  state.thinkTimer = setTimeout(function () {
    if (session !== state.speakSession) return;
    removeThinking();
    addBotMessage(sentences);
    speakSentences(session, sentences, text);
  }, CONFIG.thinkingDelayMs);
}

function speakSentences(session, sentences, fullText) {
  // No voice available: still animate and show the text
  if (!("speechSynthesis" in window)) {
    highlightSentence(0);
    state.speakWatchdog = setTimeout(function () { finishSpeaking(session); }, estimateSpeechMs(fullText));
    return;
  }

  const synth = window.speechSynthesis;
  synth.cancel();
  let index = 0;

  function speakNext() {
    if (session !== state.speakSession) return;   // a newer answer took over
    if (index >= sentences.length) { finishSpeaking(session); return; }

    const sentenceIndex = index++;
    const utterance = new SpeechSynthesisUtterance(sentences[sentenceIndex]);
    applyVoice(utterance);
    state.currentUtterance = utterance;

    let moved = false;
    const goToNext = function () {
      if (moved || session !== state.speakSession) return;
      moved = true;
      clearTimeout(state.speakWatchdog);
      speakNext();
    };

    utterance.onstart = function () {
      if (session === state.speakSession) highlightSentence(sentenceIndex);
    };
    utterance.onend = goToNext;
    utterance.onerror = function (event) {
      console.warn("Speech error:", event.error);
      if (event.error === "interrupted" || event.error === "canceled") return;
      goToNext();
    };

    // Safety net: if the browser never reports "finished", carry on anyway
    clearTimeout(state.speakWatchdog);
    state.speakWatchdog = setTimeout(goToNext, estimateSpeechMs(sentences[sentenceIndex]) * 1.6 + 5000);

    highlightSentence(sentenceIndex);
    synth.speak(utterance);
  }

  // Chrome sometimes ignores speak() called immediately after cancel()
  setTimeout(speakNext, 120);
}

function finishSpeaking(session) {
  if (session !== state.speakSession) return;
  clearTimeout(state.speakWatchdog);
  markAllSentencesDone();
  setMode("idle");
  continueConversation();
}

/** Stops any speech that is playing (safe to call at any time). */
function stopSpeaking() {
  state.speakSession++;
  clearTimeout(state.speakWatchdog);
  clearTimeout(state.thinkTimer);
  removeThinking();
  markAllSentencesDone();
  if ("speechSynthesis" in window) {
    try { window.speechSynthesis.cancel(); } catch (ignore) { /* nothing to stop */ }
  }
}


/* =========================================================================
   8. DEMO BACKUP MODE
   -------------------------------------------------------------------------
   Open:  CTRL + D (or CMD + D on Mac), or press and hold the logo for 2 s.
   Close: the × button, ESC, or tap outside the panel.
   ========================================================================= */

function buildDevPanel() {
  els.devQuestions.textContent = "";
  knowledgeBase.forEach(function (item, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dev-q";

    const num = document.createElement("span");
    num.className = "num";
    num.textContent = String(index + 1);

    const text = document.createElement("span");
    text.textContent = item.question;

    const cat = document.createElement("span");
    cat.className = "cat";
    cat.textContent = item.category || "";

    button.append(num, text, cat);
    button.addEventListener("click", function () {
      closeDevPanel();
      askFromKnowledgeBase(item);
    });
    els.devQuestions.appendChild(button);
  });
}

/** Same chat bubbles, animation and voice as a real spoken question. */
function askFromKnowledgeBase(item) {
  warmUpSpeech();
  cancelRehearsed();
  if (state.mode === "listening") abortListening();
  commitKidMessage(item.question);
  if (item.action !== "quiz") state.quiz.active = false;   // a normal question ends a quiz
  respondToItem(item);
}

/** Backup buttons for the quiz: say the right (or a wrong) answer for Gugan. */
function answerQuizFromPanel(correct) {
  warmUpSpeech();
  cancelRehearsed();
  if (state.mode === "listening") abortListening();
  if (!state.quiz.active) {
    commitKidMessage("Can you give me a maths quiz?");
    startQuiz();
    return;
  }
  const current = state.quiz.questions[state.quiz.index];
  const said = String(correct ? current.answer : current.answer + 1);
  commitKidMessage(said);
  handleQuizAnswer([said]);
}

function openDevPanel() {
  state.devOpen = true;
  if (state.mode === "listening" && !state.rehearsedMode) resetToIdle();
  updateDevInfo();
  els.devPanel.hidden = false;
}

function closeDevPanel() {
  state.devOpen = false;
  els.devPanel.hidden = true;
}

function toggleDevPanel() {
  if (state.devOpen) closeDevPanel(); else openDevPanel();
}

function updateDevInfo() {
  if (!els.devInfo) return;
  const offlineText = {
    "not-checked": "needs internet (tap 'Set up offline listening' to try offline)",
    checking: "checking offline listening…",
    ready: "works OFFLINE too (" + state.localLang + ")",
    downloading: "downloading offline speech pack… (keep Wi-Fi on)",
    unavailable: "needs internet (offline listening not available here)",
    unsupported: "needs internet"
  }[state.localStatus] || "needs internet";
  const listening = window.__BUDDY_ANDROID_APP
    ? "Listening: tablet speech (works offline once the offline English pack is downloaded)"
    : state.recognitionSupported
      ? "Listening: " + offlineText
      : "Listening: NOT supported in this browser";
  if (els.devInstall) els.devInstall.hidden = !(state.localStatus === "not-checked" || state.localStatus === "unavailable");
  const voice = state.chosenVoice
    ? "Voice: " + state.chosenVoice.name + (state.chosenVoice.localService ? " (offline)" : " (online)")
    : ("speechSynthesis" in window ? "Voice: browser default" : "Voice: NOT supported");
  const network = navigator.onLine ? "Internet: connected" : "Internet: OFFLINE";
  els.devInfo.textContent = listening + "  •  " + voice + "  •  " + network + (state.lite ? "  •  Lite mode ON" : "");
  updateRehearsedHint();
}

/* ---- Rehearsed mode: Talk button plays questions in order, no microphone ---- */

function getRehearsedItem() {
  const order = CONFIG.rehearsedOrder.length
    ? CONFIG.rehearsedOrder
    : knowledgeBase.map(function (q) { return q.id; });
  const id = order[state.rehearsedIndex % order.length];
  return knowledgeBase.find(function (q) { return q.id === id; }) || knowledgeBase[0];
}

function updateRehearsedHint() {
  if (!els.devNext) return;
  els.devNext.textContent = state.rehearsedMode
    ? "Next: “" + getRehearsedItem().question + "”"
    : "";
}

function startRehearsedTurn() {
  let item;
  if (state.quiz.active) {
    // During a quiz, rehearsed mode "says" the correct answer
    item = { question: String(state.quiz.questions[state.quiz.index].answer), quizAnswer: true };
  } else {
    item = getRehearsedItem();
    state.rehearsedIndex++;
  }
  state.rehearsedItem = item;

  stopSpeaking();
  setMode("listening");
  startLiveKidMessage();

  const session = ++state.rehearsedSession;
  const words = item.question.split(" ");
  let shown = 0;

  function typeNextWord() {
    if (session !== state.rehearsedSession || state.mode !== "listening") return;
    shown++;
    updateLiveKidMessage(words.slice(0, shown).join(" "));
    if (shown < words.length) {
      state.rehearsedTimer = setTimeout(typeNextWord, CONFIG.rehearsedWordDelayMs);
    } else {
      state.rehearsedTimer = setTimeout(finishRehearsedTurn, 700);
    }
  }
  state.rehearsedTimer = setTimeout(typeNextWord, CONFIG.rehearsedStartDelayMs);
  updateRehearsedHint();
}

/** Show the full question immediately and answer it. */
function finishRehearsedTurn() {
  const item = state.rehearsedItem;
  cancelRehearsed();
  if (!item) { discardLiveMessage(); setMode("idle"); return; }
  commitKidMessage(item.question);
  if (item.quizAnswer) handleQuizAnswer([item.question]);
  else respondToItem(item);
}

function cancelRehearsed() {
  state.rehearsedSession++;
  clearTimeout(state.rehearsedTimer);
}


/* =========================================================================
   9. STARTUP
   ========================================================================= */

/** Tap-to-Talk button: talk / stop listening / stop speaking. */
function onTalkButton() {
  warmUpSpeech();

  if (state.mode === "listening") {
    if (state.rehearsedMode) { finishRehearsedTurn(); return; }
    // Tap while listening = stop the conversation
    endConversation();
    abortListening();
    discardLiveMessage();
    setMode("idle");
    return;
  }

  if (state.mode === "speaking") {
    endConversation();
    stopSpeaking();
    setMode("idle");
    return;
  }

  if (state.rehearsedMode) { startRehearsedTurn(); return; }
  startConversation();
  startListening();
}

/** Stops everything and returns to idle (keeps the chat). */
function resetToIdle() {
  endConversation();
  cancelRehearsed();
  abortListening();
  stopSpeaking();
  discardLiveMessage();
  setMode("idle");
}

/** Show the real logo / robot picture if the files exist, otherwise the built-in ones. */
function watchImage(img, onLoaded, onMissing) {
  if (!img) return;
  if (img.complete) {
    if (img.naturalWidth > 0) onLoaded(); else onMissing();
    return;
  }
  img.addEventListener("load", onLoaded, { once: true });
  img.addEventListener("error", onMissing, { once: true });
}

function setupImages() {
  watchImage(
    els.schoolLogo,
    function () { els.logoWrap.classList.add("logo-loaded"); },
    function () { els.logoWrap.classList.add("logo-missing"); }
  );
  watchImage(
    els.robotImage,
    function () { document.body.classList.add("use-robot-image"); },
    function () { document.body.classList.remove("use-robot-image"); }
  );
}

/** Press and hold the logo for 2 seconds to open the backup panel (for tablets). */
function setupLogoLongPress() {
  let pressTimer = null;
  const cancel = function () { clearTimeout(pressTimer); };
  els.logoWrap.addEventListener("pointerdown", function () {
    cancel();
    pressTimer = setTimeout(openDevPanel, 2000);
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach(function (name) {
    els.logoWrap.addEventListener(name, cancel);
  });
  els.logoWrap.addEventListener("contextmenu", function (e) { e.preventDefault(); });
}

/** Clock in the phone status bar (laptop view). */
function startClock() {
  const tick = function () {
    els.clock.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, "");
  };
  tick();
  setInterval(tick, 15000);
}

/** Splash screen, then the robot jumps in and waves hello. */
function runSplash() {
  if (!CONFIG.showSplash || !els.splash) {
    els.splash && (els.splash.hidden = true);
    robotEntrance();
    return;
  }
  let done = false;
  const hide = function () {
    if (done) return;
    done = true;
    warmUpSpeech();
    els.splash.classList.add("hide");
    setTimeout(function () { els.splash.hidden = true; }, 650);
    robotEntrance();
  };
  els.splash.addEventListener("click", hide);
  setTimeout(hide, CONFIG.splashDurationMs);
}

function robotEntrance() {
  document.body.classList.add("entering", "waving");
  setTimeout(function () { document.body.classList.remove("entering"); }, 1300);
  setTimeout(function () { document.body.classList.remove("waving"); }, 2400);
}

function bindEvents() {
  els.talkButton.addEventListener("click", onTalkButton);

  document.addEventListener("keydown", function (event) {
    const key = (event.key || "").toLowerCase();

    // CTRL + D (or CMD + D) opens / closes the hidden backup panel
    if ((event.ctrlKey || event.metaKey) && key === "d") {
      event.preventDefault();
      toggleDevPanel();
      return;
    }
    if (key === "escape" && state.devOpen) { closeDevPanel(); return; }

    // Space bar = Tap to Talk (handy on a laptop), unless a button has focus
    if (key === " " && !state.devOpen && document.activeElement === document.body) {
      event.preventDefault();
      onTalkButton();
    }
  });

  els.devClose.addEventListener("click", closeDevPanel);
  els.devPanel.addEventListener("click", function (event) {
    if (event.target === els.devPanel) closeDevPanel();   // tap outside the sheet
  });

  els.devRehearsed.addEventListener("change", function () {
    state.rehearsedMode = els.devRehearsed.checked;
    document.body.classList.toggle("rehearsed-mode", state.rehearsedMode);
    updateRehearsedHint();
  });
  els.devResetOrder.addEventListener("click", function () {
    state.rehearsedIndex = 0;
    updateRehearsedHint();
  });
  els.devTestVoice.addEventListener("click", function () {
    closeDevPanel();
    warmUpSpeech();
    speakAnswer("Hello " + STUDENT_NAME + "! I am Velammal Buddy. I am ready to help you learn.");
  });
  els.devStop.addEventListener("click", resetToIdle);
  els.devQuizRight.addEventListener("click", function () { closeDevPanel(); answerQuizFromPanel(true); });
  els.devQuizWrong.addEventListener("click", function () { closeDevPanel(); answerQuizFromPanel(false); });

  const onNetworkChange = function () {
    updateDevInfo();
    if (state.mode === "idle") setMode("idle");
  };
  window.addEventListener("online", onNetworkChange);
  window.addEventListener("offline", onNetworkChange);
  if (els.devInstall) els.devInstall.addEventListener("click", setupOfflineListening);
  const voiceSettingsButton = document.getElementById("devVoiceSettings");
  if (voiceSettingsButton) {
    voiceSettingsButton.hidden = !window.AndroidBuddy;
    voiceSettingsButton.addEventListener("click", function () {
      if (window.AndroidBuddy) window.AndroidBuddy.openVoiceSettings();
    });
  }

  // If the tab is hidden while Buddy is busy, stop cleanly (the chat stays)
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && state.mode !== "idle") resetToIdle();
  });
}

/** Lite mode for older, slower devices (e.g. Galaxy Tab A 8.0). */
function setupLiteMode() {
  let lite = CONFIG.liteMode === true;
  if (CONFIG.liteMode === "auto") {
    const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || "");
    const memory = navigator.deviceMemory || 4;
    const cores = navigator.hardwareConcurrency || 8;
    lite = isMobile && (memory <= 3 || cores <= 4);
  }
  const param = (location.search.match(/[?&]lite=(\w+)/) || [])[1];
  if (param === "1" || param === "true") lite = true;
  if (param === "0" || param === "false") lite = false;
  document.body.classList.toggle("lite", lite);
  state.lite = lite;
}

/** Lets the app be installed ("Add to Home screen") and work offline after the first visit. */
function registerOfflineSupport() {
  if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register("sw.js").catch(function (error) {
    console.warn("Offline support not available:", error);
  });
}

function init() {
  [
    "logoWrap", "schoolLogo", "robotImage", "statusBubble", "statusText",
    "chat", "talkButton", "talkLabel", "pillText", "clock", "splash",
    "devPanel", "devClose", "devInfo", "devQuestions", "devRehearsed",
    "devNext", "devTestVoice", "devResetOrder", "devStop", "devQuizRight", "devQuizWrong", "devInstall"
  ].forEach(function (id) { els[id] = document.getElementById(id); });

  setupLiteMode();
  registerOfflineSupport();
  setupImages();
  setupRecognition();

  if ("speechSynthesis" in window) {
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
  }

  buildDevPanel();
  setupLogoLongPress();
  bindEvents();
  startClock();
  setMode("idle");
  updateDevInfo();
  runSplash();
}

// Start the app (the check lets this file also be loaded for testing outside a browser)
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}
