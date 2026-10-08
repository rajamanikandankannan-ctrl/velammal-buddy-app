/* =========================================================================
   VELAMMAL BUDDY — android-bridge.js  (tablet app only)
   -------------------------------------------------------------------------
   Inside the Android app there is no browser speech engine. This file makes
   the tablet's own OFFLINE speech recogniser and voice look exactly like the
   browser's, so script.js works without any changes:
     window.webkitSpeechRecognition  -> Android SpeechRecognizer (offline)
     window.speechSynthesis          -> Android TextToSpeech     (offline)
   It does nothing when the page is opened in a normal browser.
   ========================================================================= */
(function () {
  "use strict";
  var bridge = window.AndroidBuddy;
  if (!bridge) return;                       // not inside the Android app
  window.__BUDDY_ANDROID_APP = true;

  /* ---------------- LISTENING ---------------- */

  var activeRecognition = null;
  var currentId = 0;

  /* Two ways to listen:
     "service" = quiet background listening (normal)
     "popup"   = Google's "Speak now" pop-up (very reliable on older tablets)
     "auto"    = try "service"; if the tablet's speech engine does not answer
                 within a few seconds, switch to "popup" by itself. */
  var MODE_KEY = "velammalBuddy.listenMode";
  var START_TIMEOUT_MS = 4000;     // engine must say "ready" within this time
  var STOP_TIMEOUT_MS = 4000;      // after "stop", it must finish within this time
  var MAX_LISTEN_MS = 15000;       // never listen longer than this in one go

  function readMode() {
    try { return localStorage.getItem(MODE_KEY) || "auto"; } catch (e) { return "auto"; }
  }
  function saveMode(mode) {
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) { /* ignore */ }
  }
  var listenMode = readMode();          // what the user chose
  var serviceWorks = null;              // null = unknown yet, true/false once known

  /* A short history of what the speech engine did (shown in the backup panel) */
  var speechLog = [];
  function log(text) {
    var t = new Date();
    var stamp = ("0" + t.getMinutes()).slice(-2) + ":" + ("0" + t.getSeconds()).slice(-2);
    speechLog.push(stamp + "  " + text);
    if (speechLog.length > 14) speechLog.shift();
    if (typeof window.__onSpeechLog === "function") {
      try { window.__onSpeechLog(); } catch (e) { /* ignore */ }
    }
  }

  /* Buddy's built-in engine listens only for Buddy's words (much more accurate
     for a child's voice). The words are taken from the questions in script.js. */
  var vocabularySent = false;
  var EXTRA_WORDS = (
    "hello hi hey buddy velammal what is the a an are was were why how who where when which " +
    "can could do does did i me my you your we our it this that these those there here " +
    "in on at of to for from with and or not no yes please thank thanks tell about give " +
    "have has get go went play played school teacher class today tomorrow yesterday " +
    "sentence correct right wrong answer question quiz maths math test stop start again " +
    "bye goodbye good night see later morning name many much more " +
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen " +
    "fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy " +
    "eighty ninety hundred plus minus times divided by into multiply"
  ).split(" ");

  function sendVocabulary() {
    if (vocabularySent || typeof bridge.setVocabulary !== "function") return;
    var words = {};
    function addText(text) {
      String(text || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).forEach(function (w) {
        if (w) words[w] = true;
      });
    }
    EXTRA_WORDS.forEach(addText);
    try {
      if (typeof knowledgeBase !== "undefined") {
        knowledgeBase.forEach(function (item) {
          addText(item.question);
          (item.keywords || []).forEach(function (k) { addText(String(k).replace(/\|/g, " ")); });
        });
      }
      if (typeof quizQuestions !== "undefined") {
        quizQuestions.forEach(function (q) { addText(q.question); });
      }
    } catch (e) { /* use the extra words only */ }
    var list = Object.keys(words);
    list.push("[unk]");
    bridge.setVocabulary(JSON.stringify(list));
    vocabularySent = true;
    log("sent " + (list.length - 1) + " words to the built-in engine");
  }

  function usePopup() {
    return listenMode === "popup" || (listenMode === "auto" && serviceWorks === false);
  }

  function makeResult(texts, isFinal) {
    var result = texts.map(function (t) { return { transcript: t, confidence: 0.9 }; });
    result.isFinal = isFinal;
    result.item = function (i) { return result[i]; };
    return result;
  }

  function fire(rec, name, event) {
    var handler = rec["on" + name];
    if (typeof handler === "function") {
      try { handler.call(rec, event || {}); } catch (e) { console.error(e); }
    }
  }

  function clearTimers(rec) {
    clearTimeout(rec._startTimer);
    clearTimeout(rec._stopTimer);
    clearTimeout(rec._maxTimer);
  }

  function finishSession(rec) {
    if (!rec._running) return;
    clearTimers(rec);
    rec._running = false;
    if (activeRecognition === rec) activeRecognition = null;
    fire(rec, "end", {});
  }

  function AndroidSpeechRecognition() {
    this.lang = "en-IN";
    this.continuous = false;
    this.interimResults = true;
    this.maxAlternatives = 3;
    this.processLocally = true;
    this.onstart = this.onresult = this.onerror = this.onend = null;
    this._running = false;
    this._id = 0;
  }

  AndroidSpeechRecognition.prototype.start = function () {
    if (this._running) {
      var err = new Error("Recognition has already started");
      err.name = "InvalidStateError";
      throw err;
    }
    if (activeRecognition && activeRecognition !== this) activeRecognition.abort();
    var rec = this;
    rec._running = true;
    rec._id = ++currentId;
    rec._gotReady = false;
    rec._gotResult = false;
    activeRecognition = rec;
    var lang = rec.lang || "en-IN";
    sendVocabulary();

    if (usePopup()) {
      log("listen #" + rec._id + " using Google pop-up");
      rec._popup = true;
      window.__androidSpeech.popupActive = true;
      bridge.startListeningPopup(rec._id, lang);
      return;                                   // the pop-up has its own timing
    }

    rec._popup = false;
    log("listen #" + rec._id + " using background engine");
    bridge.startListening(rec._id, lang, !!rec.interimResults, rec.maxAlternatives || 3);

    // Safety net 1: the engine must answer quickly
    rec._startTimer = setTimeout(function () {
      if (!rec._running || rec._gotReady || rec._id !== currentId) return;
      log("engine did not answer in " + (START_TIMEOUT_MS / 1000) + " s");
      bridge.abortListening();
      if (listenMode === "auto") {
        // Switch to Google's pop-up for the rest of the session
        serviceWorks = false;
        log("switching to Google pop-up");
        rec._popup = true;
        rec._id = ++currentId;
        window.__androidSpeech.popupActive = true;
        bridge.startListeningPopup(rec._id, lang);
      } else {
        fire(rec, "error", { error: "service-not-allowed" });
        finishSession(rec);
      }
    }, START_TIMEOUT_MS);

    // Safety net 2: never listen forever
    rec._maxTimer = setTimeout(function () {
      if (rec._running && !rec._popup) rec.stop();
    }, MAX_LISTEN_MS);
  };

  AndroidSpeechRecognition.prototype.stop = function () {
    if (!this._running) return;
    var rec = this;
    if (rec._popup) return;                     // the pop-up finishes by itself
    bridge.stopListening();
    // Safety net 3: if the engine never reports back, finish anyway
    clearTimeout(rec._stopTimer);
    rec._stopTimer = setTimeout(function () {
      if (!rec._running) return;
      log("engine did not finish - moving on");
      bridge.abortListening();
      fire(rec, "error", { error: "no-speech" });
      finishSession(rec);
    }, STOP_TIMEOUT_MS);
  };

  AndroidSpeechRecognition.prototype.abort = function () {
    if (!this._running) return;
    var rec = this;
    clearTimers(rec);
    currentId++;                              // ignore anything still coming from Android
    bridge.abortListening();
    setTimeout(function () {
      fire(rec, "error", { error: "aborted" });
      finishSession(rec);
    }, 0);
  };

  AndroidSpeechRecognition.prototype.addEventListener = function () {};
  AndroidSpeechRecognition.prototype.removeEventListener = function () {};

  var engineState = "loading";
  try { engineState = bridge.getEngineState ? bridge.getEngineState() : "failed"; } catch (e) { engineState = "failed"; }

  window.__androidSpeech = {
    popupActive: false,
    getEngineState: function () { return engineState; },
    onEngine: function (stateName) {
      engineState = stateName;
      log("built-in engine " + stateName);
    },
    getLog: function () { return speechLog.slice(); },
    getMode: function () { return listenMode; },
    getStatus: function () {
      if (engineState === "ready" && listenMode !== "popup") return "Buddy's built-in offline engine (ready)";
      if (engineState === "loading" && listenMode !== "popup") return "Buddy's built-in engine is getting ready…";
      if (listenMode === "popup") return "Google pop-up (chosen)";
      if (listenMode === "service") return "background engine (chosen)";
      if (serviceWorks === false) return "auto: using Google pop-up (background engine did not answer)";
      if (serviceWorks === true) return "auto: background engine works";
      return "auto: not tested yet";
    },
    setMode: function (mode) {
      listenMode = mode;
      saveMode(mode);
      if (mode === "auto") serviceWorks = null;
      log("listening mode set to " + mode);
    },
    onEvent: function (id, type, data) {
      if (type !== "partial") log("#" + id + " " + type + (data && type !== "results" ? " (" + data + ")" : ""));
      else log("#" + id + " heard: " + String(data).slice(0, 40));
      if (type === "results") log("#" + id + " result: " + String(data).slice(0, 60));
      var rec = activeRecognition;
      if (!rec || id !== currentId || id !== rec._id) return;
      if (type === "start") {
        if (!rec._popup) {
          rec._gotReady = true;
          clearTimeout(rec._startTimer);
          serviceWorks = true;
        }
        window.__androidSpeech.popupActive = !!rec._popup;
        fire(rec, "start", {});
      } else if (type === "begin" || type === "endspeech" || type === "diag") {
        // information only
      } else if (type === "partial") {
        if (rec.interimResults && data) fire(rec, "result", { resultIndex: 0, results: [makeResult([data], false)] });
      } else if (type === "results") {
        rec._gotResult = true;
        var list = [];
        try { list = JSON.parse(data || "[]"); } catch (e) { list = []; }
        if (list.length) fire(rec, "result", { resultIndex: 0, results: [makeResult(list, true)] });
      } else if (type === "error") {
        fire(rec, "error", { error: data || "unknown" });
      } else if (type === "end") {
        window.__androidSpeech.popupActive = false;
        finishSession(rec);
      }
    }
  };

  window.SpeechRecognition = AndroidSpeechRecognition;
  window.webkitSpeechRecognition = AndroidSpeechRecognition;

  /* ---------------- SPEAKING ---------------- */

  var utterances = {};
  var nextUtterance = 1;
  var tabletVoice = { name: "Tablet voice", lang: "en-IN", localService: true, "default": true, voiceURI: "android-tts" };

  function AndroidUtterance(text) {
    this.text = text || "";
    this.lang = "en-IN";
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
    this.voice = null;
    this.onstart = this.onend = this.onerror = null;
  }

  var synth = {
    speaking: false,
    pending: false,
    paused: false,
    getVoices: function () { return [tabletVoice]; },
    addEventListener: function () {},
    removeEventListener: function () {},
    pause: function () {},
    resume: function () {},
    speak: function (u) {
      var id = "u" + (nextUtterance++);
      var text = String(u.text || "").trim();
      if (!text || u.volume === 0) {                 // nothing to say
        setTimeout(function () { if (u.onend) u.onend({}); }, 10);
        return;
      }
      utterances[id] = u;
      synth.speaking = true;
      bridge.speak(id, text, Number(u.rate) || 1, Number(u.pitch) || 1);
    },
    cancel: function () {
      utterances = {};
      synth.speaking = false;
      bridge.stopSpeaking();
    }
  };

  window.__androidTts = {
    onEvent: function (id, type) {
      var u = utterances[id];
      if (!u) return;
      if (type === "start") {
        if (u.onstart) u.onstart({});
        return;
      }
      delete utterances[id];
      synth.speaking = Object.keys(utterances).length > 0;
      if (type === "done") { if (u.onend) u.onend({}); }
      else if (u.onerror) u.onerror({ error: "synthesis-failed" });
    }
  };

  try {
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true, writable: true });
  } catch (e) {
    window.speechSynthesis = synth;
  }
  window.SpeechSynthesisUtterance = AndroidUtterance;
})();
