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

  function finishSession(rec) {
    if (!rec._running) return;
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
    this._running = true;
    this._id = ++currentId;
    activeRecognition = this;
    bridge.startListening(this._id, this.lang || "en-IN", !!this.interimResults, this.maxAlternatives || 3);
  };

  AndroidSpeechRecognition.prototype.stop = function () {
    if (this._running) bridge.stopListening();
  };

  AndroidSpeechRecognition.prototype.abort = function () {
    if (!this._running) return;
    var rec = this;
    currentId++;                              // ignore anything still coming from Android
    bridge.abortListening();
    setTimeout(function () {
      fire(rec, "error", { error: "aborted" });
      finishSession(rec);
    }, 0);
  };

  AndroidSpeechRecognition.prototype.addEventListener = function () {};
  AndroidSpeechRecognition.prototype.removeEventListener = function () {};

  window.__androidSpeech = {
    onEvent: function (id, type, data) {
      var rec = activeRecognition;
      if (!rec || id !== currentId || id !== rec._id) return;
      if (type === "start") {
        fire(rec, "start", {});
      } else if (type === "partial") {
        if (rec.interimResults && data) fire(rec, "result", { resultIndex: 0, results: [makeResult([data], false)] });
      } else if (type === "results") {
        var list = [];
        try { list = JSON.parse(data || "[]"); } catch (e) { list = []; }
        if (list.length) fire(rec, "result", { resultIndex: 0, results: [makeResult(list, true)] });
      } else if (type === "error") {
        fire(rec, "error", { error: data || "unknown" });
      } else if (type === "end") {
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
