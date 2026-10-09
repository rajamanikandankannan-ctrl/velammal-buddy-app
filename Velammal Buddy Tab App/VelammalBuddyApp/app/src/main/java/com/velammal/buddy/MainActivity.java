package com.velammal.buddy;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognitionService;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.SpeechService;
import org.vosk.android.StorageService;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * VELAMMAL BUDDY - Android tablet app.
 *
 * The app shows the same Buddy web page (stored inside the app, in assets/www)
 * and gives it two things the tablet browser cannot do without internet:
 *   1. LISTENING  - Android's own speech recogniser, asked to work OFFLINE
 *                   (needs the free "offline speech" English pack, see README).
 *   2. SPEAKING   - the tablet's built-in text-to-speech voice.
 * LISTENING uses Buddy's OWN built-in offline speech engine (Vosk) first, so
 * it works even on tablets without Google voice search and without internet.
 * The page talks to this code through the "AndroidBuddy" bridge
 * (see assets/www/android-bridge.js).
 */
public class MainActivity extends Activity {

    private static final int REQUEST_MIC = 101;
    private static final int REQUEST_SPEECH_POPUP = 102;
    private static final String GOOGLE_APP = "com.google.android.googlequicksearchbox";
    /** Muting sounds to hide the microphone "beep" could leave the tablet silent
     *  if the app was closed at the wrong moment - so it is switched off. */
    private static final boolean HIDE_MIC_BEEP = false;
    /** Voice engines to try if the tablet's default one does not start. */
    private static final String[] TTS_ENGINES = {"com.google.android.tts", null, "com.samsung.SMT"};
    /** Oldest built-in browser engine (WebView) that runs Buddy properly. */
    private static final int MIN_WEBVIEW_MAJOR = 110;

    private final Handler main = new Handler(Looper.getMainLooper());

    private WebView webView;
    private SpeechRecognizer recognizer;
    private int currentListenId = -1;
    private String recognizerName = "default";
    private int popupListenId = -1;
    private boolean popupActive = false;
    private AudioManager audio;
    private boolean beepMuted = false;

    // Buddy's built-in offline speech engine (Vosk)
    private Model voskModel;
    private boolean voskLoading = false;
    private String voskStatus = "not loaded";
    private SpeechService voskService;
    private Recognizer voskRecognizer;
    private String voskGrammar = null;     // Buddy's words, sent by the page
    private int voskListenId = -1;
    private int pendingVoskId = -1;
    private String voskLastPartial = "";

    private TextToSpeech tts;
    private boolean ttsReady = false;
    private int ttsEngineIndex = 0;
    private String ttsStatus = "starting";
    private String ttsEngineName = "";
    private boolean ttsEngineWorks = false;                   // this engine has really spoken
    private final java.util.LinkedHashMap<String, String[]> ttsPending = new java.util.LinkedHashMap<>();
    private final java.util.HashSet<String> ttsStarted = new java.util.HashSet<>();
    private final List<String[]> waitingToSpeak = new ArrayList<>();

    // ------------------------------------------------------------------
    // Start-up
    // ------------------------------------------------------------------

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        audio = (AudioManager) getSystemService(AUDIO_SERVICE);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);

        webView = new WebView(this);
        setContentView(webView);
        hideSystemBars();

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setBuiltInZoomControls(false);
        s.setSupportZoom(false);
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient());
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.addJavascriptInterface(new Bridge(), "AndroidBuddy");
        webView.loadUrl("file:///android_asset/www/index.html");

        ensureSoundOn();
        setupTextToSpeech();
        loadVoskModel();
        askForMicrophone();
        checkWebViewVersion();
    }

    private void hideSystemBars() {
        webView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void askForMicrophone() {
        if (Build.VERSION.SDK_INT >= 23
                && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_MIC);
        }
    }

    private boolean hasMicPermission() {
        return Build.VERSION.SDK_INT < 23
                || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQUEST_MIC && (results.length == 0 || results[0] != PackageManager.PERMISSION_GRANTED)) {
            Toast.makeText(this, "Buddy needs the microphone to hear you. Allow it in Settings > Apps > Velammal Buddy.",
                    Toast.LENGTH_LONG).show();
        }
    }

    /** Old tablets may have an old built-in browser engine; Buddy needs a newer one. */
    private void checkWebViewVersion() {
        if (Build.VERSION.SDK_INT < 26) return;
        try {
            PackageInfo info = WebView.getCurrentWebViewPackage();
            if (info == null || info.versionName == null) return;
            int major = Integer.parseInt(info.versionName.split("\\.")[0]);
            if (major >= MIN_WEBVIEW_MAJOR) return;
            final String pkg = info.packageName;
            new AlertDialog.Builder(this)
                    .setTitle("Please update Chrome")
                    .setMessage("Buddy needs a newer version of Google Chrome / Android System WebView "
                            + "(this tablet has version " + major + "). Connect to Wi-Fi and update it "
                            + "from the Play Store, then open Buddy again.")
                    .setPositiveButton("Open Play Store", (d, w) -> openPlayStore(pkg))
                    .setNegativeButton("Later", null)
                    .show();
        } catch (Exception ignored) {
            // Version check is only a helpful hint
        }
    }

    private void openPlayStore(String pkg) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg)));
        } catch (ActivityNotFoundException e) {
            startActivity(new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://play.google.com/store/apps/details?id=" + pkg)));
        }
    }

    // ------------------------------------------------------------------
    // Sending events back to the web page
    // ------------------------------------------------------------------

    private void runJs(final String js) {
        main.post(() -> {
            if (webView != null) webView.evaluateJavascript(js, null);
        });
    }

    private void speechEvent(int id, String type, String data) {
        runJs("window.__androidSpeech && window.__androidSpeech.onEvent(" + id + ","
                + JSONObject.quote(type) + "," + (data == null ? "null" : JSONObject.quote(data)) + ")");
    }

    private void ttsEvent(String id, String type) {
        runJs("window.__androidTts && window.__androidTts.onEvent(" + JSONObject.quote(id) + ","
                + JSONObject.quote(type) + ")");
    }

    // ------------------------------------------------------------------
    // LISTENING (offline speech recognition)
    // ------------------------------------------------------------------

    private void startListening(int id, String lang, boolean partial, int maxResults) {
        if (!hasMicPermission()) {
            speechEvent(id, "error", "not-allowed");
            speechEvent(id, "end", null);
            askForMicrophone();
            return;
        }
        if (voskModel != null || voskLoading) {
            startVosk(id);
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            speechEvent(id, "error", "service-not-allowed");
            speechEvent(id, "end", null);
            return;
        }
        if (recognizer == null) {
            recognizer = createBestRecognizer();
        } else {
            recognizer.cancel();
        }
        currentListenId = id;
        recognizer.setRecognitionListener(new Listener(id));

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, partial);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, Math.max(1, maxResults));
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
        if (Build.VERSION.SDK_INT >= 23) {
            // Use the downloaded offline English pack - no internet needed
            intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        }

        muteBeep(true);
        try {
            recognizer.startListening(intent);
        } catch (Exception e) {
            muteBeep(false);
            resetRecognizer();
            speechEvent(id, "error", "audio-capture");
            speechEvent(id, "end", null);
        }
    }

    /** Prefer Google's speech engine (works offline with the English pack);
     *  Samsung's own engine on some tablets never answers. */
    private SpeechRecognizer createBestRecognizer() {
        ComponentName google = findRecognitionService(GOOGLE_APP);
        if (google != null) {
            recognizerName = google.flattenToShortString();
            return SpeechRecognizer.createSpeechRecognizer(this, google);
        }
        recognizerName = "default (" + describeDefaultRecognizer() + ")";
        return SpeechRecognizer.createSpeechRecognizer(this);
    }

    private ComponentName findRecognitionService(String preferredPackage) {
        try {
            List<ResolveInfo> services = getPackageManager().queryIntentServices(
                    new Intent(RecognitionService.SERVICE_INTERFACE), 0);
            if (services == null) return null;
            for (ResolveInfo info : services) {
                if (info.serviceInfo != null && preferredPackage.equals(info.serviceInfo.packageName)) {
                    return new ComponentName(info.serviceInfo.packageName, info.serviceInfo.name);
                }
            }
        } catch (Exception ignored) { }
        return null;
    }

    private String describeDefaultRecognizer() {
        try {
            String value = Settings.Secure.getString(getContentResolver(), "voice_recognition_service");
            return value == null ? "unknown" : value;
        } catch (Exception e) {
            return "unknown";
        }
    }

    private String listRecognitionServices() {
        StringBuilder sb = new StringBuilder();
        try {
            List<ResolveInfo> services = getPackageManager().queryIntentServices(
                    new Intent(RecognitionService.SERVICE_INTERFACE), 0);
            if (services != null) {
                for (ResolveInfo info : services) {
                    if (info.serviceInfo == null) continue;
                    if (sb.length() > 0) sb.append(", ");
                    sb.append(info.serviceInfo.packageName);
                }
            }
        } catch (Exception ignored) { }
        return sb.length() == 0 ? "none" : sb.toString();
    }

    private String appVersion(String pkg) {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(pkg, 0);
            return info.versionName;
        } catch (Exception e) {
            return "not installed";
        }
    }

    /** Fallback: Google's own "Speak now" pop-up. Very reliable on older Android. */
    private void startListeningPopup(int id, String lang) {
        if (!hasMicPermission()) {
            speechEvent(id, "error", "not-allowed");
            speechEvent(id, "end", null);
            askForMicrophone();
            return;
        }
        abortListening();
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Ask Buddy a question");
        if (Build.VERSION.SDK_INT >= 23) intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        try {
            popupListenId = id;
            popupActive = true;
            startActivityForResult(intent, REQUEST_SPEECH_POPUP);
            speechEvent(id, "start", null);
        } catch (Exception e) {
            popupActive = false;
            popupListenId = -1;
            speechEvent(id, "error", "service-not-allowed");
            speechEvent(id, "end", null);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_SPEECH_POPUP) return;
        int id = popupListenId;
        popupActive = false;
        popupListenId = -1;
        if (id < 0) return;
        ArrayList<String> list = (resultCode == RESULT_OK && data != null)
                ? data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS) : null;
        JSONArray array = new JSONArray();
        if (list != null) {
            for (String text : list) {
                if (text != null && !text.trim().isEmpty()) array.put(text);
            }
        }
        if (array.length() > 0) speechEvent(id, "results", array.toString());
        else speechEvent(id, "error", resultCode == RESULT_CANCELED ? "aborted" : "no-speech");
        speechEvent(id, "end", null);
    }

    private void stopListening() {
        if (pendingVoskId >= 0) {                 // engine still loading - give up this round
            int id = pendingVoskId;
            pendingVoskId = -1;
            speechEvent(id, "error", "no-speech");
            speechEvent(id, "end", null);
            return;
        }
        if (voskService != null) {
            voskService.stop();                   // Vosk then reports its final result
            return;
        }
        if (recognizer != null) recognizer.stopListening();
    }

    private void abortListening() {
        currentListenId = -1;
        pendingVoskId = -1;
        voskListenId = -1;
        stopVosk();
        if (recognizer != null) recognizer.cancel();
        muteBeep(false);
    }

    // ------------------------------------------------------------------
    // BUDDY'S OWN OFFLINE SPEECH ENGINE (Vosk)
    // ------------------------------------------------------------------

    /** Unpacks the speech model that is stored inside the app (first launch takes a little while). */
    private void loadVoskModel() {
        if (voskModel != null || voskLoading) return;
        voskLoading = true;
        voskStatus = "getting ready";
        try {
            StorageService.unpack(this, "model-en-us", "model",
                    model -> {
                        voskModel = model;
                        voskLoading = false;
                        voskStatus = "ready";
                        runJs("window.__androidSpeech && window.__androidSpeech.onEngine('ready')");
                        if (pendingVoskId >= 0) {
                            int id = pendingVoskId;
                            pendingVoskId = -1;
                            startVosk(id);
                        }
                    },
                    error -> voskFailed("could not unpack: " + error.getMessage()));
        } catch (Throwable t) {
            voskFailed(t.getClass().getSimpleName() + ": " + t.getMessage());
        }
    }

    private void voskFailed(String why) {
        voskLoading = false;
        voskModel = null;
        voskStatus = "failed (" + why + ")";
        runJs("window.__androidSpeech && window.__androidSpeech.onEngine('failed')");
        if (pendingVoskId >= 0) {
            int id = pendingVoskId;
            pendingVoskId = -1;
            speechEvent(id, "diag", "built-in engine " + voskStatus);
            speechEvent(id, "error", "service-not-allowed");
            speechEvent(id, "end", null);
        }
    }

    private void startVosk(int id) {
        stopVosk();
        if (voskModel == null) {
            if (voskLoading) {                    // start as soon as the engine is ready
                pendingVoskId = id;
                speechEvent(id, "start", null);
                speechEvent(id, "diag", "built-in engine getting ready");
                return;
            }
            speechEvent(id, "error", "service-not-allowed");
            speechEvent(id, "end", null);
            return;
        }
        voskListenId = id;
        voskLastPartial = "";
        try {
            voskRecognizer = createVoskRecognizer();
            voskService = new SpeechService(voskRecognizer, 16000.0f);
            voskService.startListening(new VoskListener(id), 12000);
            speechEvent(id, "start", null);
            speechEvent(id, "diag", "built-in engine listening");
        } catch (Throwable t) {
            stopVosk();
            voskListenId = -1;
            speechEvent(id, "diag", "built-in engine error: " + t.getMessage());
            speechEvent(id, "error", "audio-capture");
            speechEvent(id, "end", null);
        }
    }

    /** Listens only for Buddy's words when the page has sent them - much more accurate. */
    private Recognizer createVoskRecognizer() throws java.io.IOException {
        if (voskGrammar != null) {
            try {
                return new Recognizer(voskModel, 16000.0f, voskGrammar);
            } catch (Throwable ignored) {
                // fall back to free listening
            }
        }
        return new Recognizer(voskModel, 16000.0f);
    }

    private void stopVosk() {
        if (voskService != null) {
            try { voskService.stop(); } catch (Throwable ignored) { }
            try { voskService.shutdown(); } catch (Throwable ignored) { }
            voskService = null;
        }
        if (voskRecognizer != null) {
            try { voskRecognizer.close(); } catch (Throwable ignored) { }
            voskRecognizer = null;
        }
    }

    private static String voskText(String json, String key) {
        try {
            String text = new JSONObject(json).optString(key, "");
            return text.replace("[unk]", " ").replaceAll("\\s+", " ").trim();
        } catch (Exception e) {
            return "";
        }
    }

    /** Receives what Buddy's own engine hears. */
    private class VoskListener implements org.vosk.android.RecognitionListener {
        private final int id;
        private boolean done = false;

        VoskListener(int id) { this.id = id; }

        private boolean stale() { return done || id != voskListenId; }

        private void finish(String text) {
            done = true;
            voskListenId = -1;
            main.post(MainActivity.this::stopVosk);
            if (text != null && !text.trim().isEmpty()) {
                speechEvent(id, "results", new JSONArray().put(text.trim()).toString());
            } else {
                speechEvent(id, "error", "no-speech");
            }
            speechEvent(id, "end", null);
        }

        @Override public void onPartialResult(String hypothesis) {
            if (stale()) return;
            String text = voskText(hypothesis, "partial");
            if (!text.isEmpty() && !text.equals(voskLastPartial)) {
                voskLastPartial = text;
                speechEvent(id, "partial", text);
            }
        }

        @Override public void onResult(String hypothesis) {
            if (stale()) return;
            String text = voskText(hypothesis, "text");
            if (!text.isEmpty()) finish(text);   // a full sentence was heard
        }

        @Override public void onFinalResult(String hypothesis) {
            if (stale()) return;
            String text = voskText(hypothesis, "text");
            finish(text.isEmpty() ? voskLastPartial : text);
        }

        @Override public void onError(Exception e) {
            if (stale()) return;
            done = true;
            voskListenId = -1;
            main.post(MainActivity.this::stopVosk);
            speechEvent(id, "diag", "built-in engine error: " + (e == null ? "" : e.getMessage()));
            speechEvent(id, "error", "audio-capture");
            speechEvent(id, "end", null);
        }

        @Override public void onTimeout() {
            if (stale()) return;
            finish(voskLastPartial);
        }
    }

    private void resetRecognizer() {
        if (recognizer != null) {
            try { recognizer.destroy(); } catch (Exception ignored) { }
            recognizer = null;
        }
    }

    private static String errorName(int code) {
        switch (code) {
            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "no-speech";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
            case SpeechRecognizer.ERROR_SERVER:
            case 11: // ERROR_SERVER_DISCONNECTED (Android 12+)
                return "network";
            case 12: // ERROR_LANGUAGE_NOT_SUPPORTED (Android 12+)
            case 13: // ERROR_LANGUAGE_UNAVAILABLE (Android 12+)
                return "network";
            case SpeechRecognizer.ERROR_AUDIO:
                return "audio-capture";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "not-allowed";
            case SpeechRecognizer.ERROR_CLIENT:
                return "aborted";
            default:
                return "error-" + code;
        }
    }

    /** Receives what the recogniser hears and passes it to the web page. */
    private class Listener implements RecognitionListener {
        private final int id;
        private boolean finished = false;

        Listener(int id) { this.id = id; }

        private boolean stale() { return finished || id != currentListenId; }

        private void endSession() {
            finished = true;
            muteBeep(false);
            speechEvent(id, "end", null);
        }

        @Override public void onReadyForSpeech(Bundle params) {
            if (stale()) return;
            speechEvent(id, "start", null);
            // The beep has played by now - turn the sound back on for Buddy's voice
            main.postDelayed(() -> muteBeep(false), 700);
        }

        @Override public void onBeginningOfSpeech() {
            if (!stale()) speechEvent(id, "begin", null);
        }
        @Override public void onRmsChanged(float rmsdB) { }
        @Override public void onBufferReceived(byte[] buffer) { }
        @Override public void onEndOfSpeech() {
            if (!stale()) speechEvent(id, "endspeech", null);
        }
        @Override public void onEvent(int eventType, Bundle params) { }

        @Override public void onPartialResults(Bundle partialResults) {
            if (stale()) return;
            ArrayList<String> list = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            if (list != null && !list.isEmpty() && list.get(0) != null && !list.get(0).trim().isEmpty()) {
                speechEvent(id, "partial", list.get(0));
            }
        }

        @Override public void onResults(Bundle results) {
            if (stale()) return;
            ArrayList<String> list = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            JSONArray array = new JSONArray();
            if (list != null) {
                for (String text : list) {
                    if (text != null && !text.trim().isEmpty()) array.put(text);
                }
            }
            if (array.length() > 0) speechEvent(id, "results", array.toString());
            else speechEvent(id, "error", "no-speech");
            endSession();
        }

        @Override public void onError(int error) {
            if (stale()) return;
            if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY || error == SpeechRecognizer.ERROR_CLIENT) {
                resetRecognizer();   // start fresh next time
            }
            speechEvent(id, "diag", "android error " + error);
            speechEvent(id, "error", errorName(error));
            endSession();
        }
    }

    /** Briefly silences the system sounds so the microphone "beep" is not heard. */
    private void muteBeep(boolean mute) {
        if (!HIDE_MIC_BEEP || audio == null || Build.VERSION.SDK_INT < 23) return;
        if (mute == beepMuted) return;
        beepMuted = mute;
        int direction = mute ? AudioManager.ADJUST_MUTE : AudioManager.ADJUST_UNMUTE;
        int[] streams = {AudioManager.STREAM_MUSIC, AudioManager.STREAM_SYSTEM, AudioManager.STREAM_NOTIFICATION};
        for (int stream : streams) {
            try {
                audio.adjustStreamVolume(stream, direction, 0);
            } catch (Exception ignored) {
                // e.g. Do Not Disturb is on - just skip
            }
        }
    }

    // ------------------------------------------------------------------
    // SPEAKING (tablet's built-in voice, works offline)
    // ------------------------------------------------------------------

    /** Starts a voice engine: Google first, then the tablet's default, then Samsung. */
    private void setupTextToSpeech() {
        // Skip engines that are not installed
        while (ttsEngineIndex < TTS_ENGINES.length && TTS_ENGINES[ttsEngineIndex] != null
                && "not installed".equals(appVersion(TTS_ENGINES[ttsEngineIndex]))) {
            ttsEngineIndex++;
        }
        if (ttsEngineIndex >= TTS_ENGINES.length) {
            noVoiceWorks();
            return;
        }
        final String engine = TTS_ENGINES[ttsEngineIndex];
        ttsEngineName = engine == null ? "tablet default voice" : engine;
        ttsEngineWorks = false;
        voiceDiag("starting voice engine: " + ttsEngineName);
        TextToSpeech.OnInitListener onInit = status -> main.post(() -> onTextToSpeechReady(status));
        try {
            tts = (engine == null) ? new TextToSpeech(this, onInit) : new TextToSpeech(this, onInit, engine);
        } catch (Exception e) {
            onTextToSpeechReady(TextToSpeech.ERROR);
        }
    }

    private void onTextToSpeechReady(int status) {
        if (status != TextToSpeech.SUCCESS) {
            nextVoiceEngine("could not start");
            return;
        }
        String voice = chooseInstalledEnglishVoice();
        ttsStatus = ttsEngineName + " - " + voice;
        voiceDiag("voice ready: " + ttsStatus);
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) { main.post(() -> onVoiceStarted(id)); }
            @Override public void onDone(String id) { main.post(() -> onVoiceDone(id)); }
            @Override public void onError(String id) { main.post(() -> onVoiceError(id, -1)); }
            @Override public void onError(String id, int errorCode) { main.post(() -> onVoiceError(id, errorCode)); }
        });
        ttsReady = true;
        List<String[]> queued = new ArrayList<>(waitingToSpeak);
        waitingToSpeak.clear();
        for (String[] item : queued) {
            speakNow(item[0], item[1], Float.parseFloat(item[2]), Float.parseFloat(item[3]));
        }
    }

    /** Picks an English voice that is really installed on the tablet (works offline). */
    private String chooseInstalledEnglishVoice() {
        try {
            java.util.Set<Voice> voices = tts.getVoices();
            Voice best = null;
            int bestScore = -1;
            if (voices != null) {
                for (Voice v : voices) {
                    Locale l = v.getLocale();
                    if (l == null || !"en".equals(l.getLanguage())) continue;
                    java.util.Set<String> f = v.getFeatures();
                    if (f != null && f.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                    int score = 0;
                    if (!v.isNetworkConnectionRequired()) score += 100;   // works without internet
                    String country = l.getCountry();
                    if ("IN".equals(country)) score += 30;
                    else if ("US".equals(country)) score += 20;
                    else if ("GB".equals(country)) score += 10;
                    if (score > bestScore) { best = v; bestScore = score; }
                }
            }
            if (best != null && tts.setVoice(best) == TextToSpeech.SUCCESS) {
                return best.getName() + " (" + best.getLocale()
                        + (best.isNetworkConnectionRequired() ? ", needs internet)" : ", offline)");
            }
        } catch (Exception ignored) {
            // fall back to choosing by language below
        }
        Locale[] locales = {new Locale("en", "IN"), Locale.US, Locale.UK};
        for (Locale l : locales) {
            int r = tts.setLanguage(l);
            if (r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED) {
                return "language " + l;
            }
        }
        return "no English voice installed!";
    }

    private void onVoiceStarted(String id) {
        ttsStarted.add(id);
        if (!ttsEngineWorks) {
            ttsEngineWorks = true;
            voiceDiag("voice is speaking (" + ttsEngineName + ")");
        }
        ttsEvent(id, "start");
    }

    private void onVoiceDone(String id) {
        ttsPending.remove(id);
        ttsStarted.remove(id);
        ttsEvent(id, "done");
    }

    private void onVoiceError(String id, int code) {
        voiceDiag("voice error " + code + " on " + ttsEngineName);
        if (!ttsEngineWorks) {
            nextVoiceEngine("gave an error");     // this engine never spoke - try another one
            return;
        }
        ttsPending.remove(id);
        ttsStarted.remove(id);
        ttsEvent(id, "error");
    }

    /** The current voice engine is silent: move everything waiting to the next engine. */
    private void nextVoiceEngine(String reason) {
        voiceDiag(ttsEngineName + " " + reason + " - trying the next voice engine");
        List<String[]> retry = new ArrayList<>();
        for (java.util.Map.Entry<String, String[]> e : ttsPending.entrySet()) {
            if (!ttsStarted.contains(e.getKey())) {
                String[] v = e.getValue();
                retry.add(new String[]{e.getKey(), v[0], v[1], v[2]});
            }
        }
        retry.addAll(waitingToSpeak);
        waitingToSpeak.clear();
        waitingToSpeak.addAll(retry);
        ttsPending.clear();
        ttsStarted.clear();
        ttsReady = false;
        try { if (tts != null) tts.shutdown(); } catch (Exception ignored) { }
        tts = null;
        ttsEngineIndex++;
        setupTextToSpeech();
    }

    private void noVoiceWorks() {
        ttsStatus = "NO voice engine works - check Settings > Language and input > Text-to-speech";
        voiceDiag(ttsStatus);
        for (String[] item : waitingToSpeak) ttsEvent(item[0], "error");
        waitingToSpeak.clear();
    }

    private void voiceDiag(String text) {
        speechEvent(0, "diag", text);
    }

    /** Makes sure the tablet's media sound is on and loud enough for Buddy's voice. */
    private void ensureSoundOn() {
        if (audio == null) return;
        try {
            if (Build.VERSION.SDK_INT >= 23) {
                // Undo any mute left behind by an older version of the app
                audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_UNMUTE, 0);
            }
            int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            int now = audio.getStreamVolume(AudioManager.STREAM_MUSIC);
            if (now < max * 0.4) {
                audio.setStreamVolume(AudioManager.STREAM_MUSIC, Math.round(max * 0.7f), 0);
            }
        } catch (Exception ignored) {
            // e.g. Do Not Disturb is on
        }
    }

    private String soundInfo() {
        if (audio == null) return "unknown";
        try {
            int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            int now = audio.getStreamVolume(AudioManager.STREAM_MUSIC);
            boolean muted = Build.VERSION.SDK_INT >= 23 && audio.isStreamMute(AudioManager.STREAM_MUSIC);
            return now + "/" + max + (muted ? " MUTED" : "");
        } catch (Exception e) {
            return "unknown";
        }
    }

    private void speak(String id, String text, float rate, float pitch) {
        muteBeep(false);
        ensureSoundOn();
        if (!ttsReady || tts == null) {
            waitingToSpeak.add(new String[]{id, text, String.valueOf(rate), String.valueOf(pitch)});
            return;
        }
        speakNow(id, text, rate, pitch);
    }

    private void speakNow(final String id, String text, float rate, float pitch) {
        ttsPending.put(id, new String[]{text, String.valueOf(rate), String.valueOf(pitch)});
        tts.setSpeechRate(rate);
        tts.setPitch(pitch);
        Bundle params = new Bundle();
        params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC);
        int ok = tts.speak(text, TextToSpeech.QUEUE_ADD, params, id);
        if (ok != TextToSpeech.SUCCESS) {
            onVoiceError(id, ok);
            return;
        }
        // If this engine has never spoken and stays silent, switch to the next one
        if (!ttsEngineWorks) {
            main.postDelayed(() -> {
                if (!ttsEngineWorks && ttsPending.containsKey(id) && !ttsStarted.contains(id)) {
                    nextVoiceEngine("stayed silent");
                }
            }, 3000);
        }
    }

    private void stopSpeaking() {
        waitingToSpeak.clear();
        ttsPending.clear();
        ttsStarted.clear();
        if (tts != null) tts.stop();
    }

    // ------------------------------------------------------------------
    // The bridge the web page calls (window.AndroidBuddy)
    // ------------------------------------------------------------------

    private class Bridge {
        @JavascriptInterface
        public void startListening(final int id, final String lang, final boolean partial, final int maxResults) {
            main.post(() -> MainActivity.this.startListening(id, lang, partial, maxResults));
        }

        @JavascriptInterface
        public void stopListening() {
            main.post(MainActivity.this::stopListening);
        }

        @JavascriptInterface
        public void abortListening() {
            main.post(MainActivity.this::abortListening);
        }

        @JavascriptInterface
        public void speak(final String id, final String text, final double rate, final double pitch) {
            main.post(() -> MainActivity.this.speak(id, text, (float) rate, (float) pitch));
        }

        @JavascriptInterface
        public void stopSpeaking() {
            main.post(MainActivity.this::stopSpeaking);
        }

        @JavascriptInterface
        public void startListeningPopup(final int id, final String lang) {
            main.post(() -> MainActivity.this.startListeningPopup(id, lang));
        }

        /** The page sends Buddy's words so the built-in engine listens for them. */
        @JavascriptInterface
        public void setVocabulary(final String jsonArrayOfWords) {
            main.post(() -> voskGrammar = jsonArrayOfWords);
        }

        @JavascriptInterface
        public String getEngineState() {
            return voskModel != null ? "ready" : (voskLoading ? "loading" : "failed");
        }

        @JavascriptInterface
        public String getSpeechInfo() {
            return "Voice: " + ttsStatus
                    + " | Media volume: " + soundInfo()
                    + " | Built-in engine: " + voskStatus
                    + " | Google engine: " + recognizerName
                    + " | Tablet default: " + describeDefaultRecognizer()
                    + " | Engines found: " + listRecognitionServices()
                    + " | Google app: " + appVersion(GOOGLE_APP)
                    + " | Android " + Build.VERSION.RELEASE;
        }

        @JavascriptInterface
        public boolean isRecognitionAvailable() {
            return SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
        }

        @JavascriptInterface
        public boolean hasMicrophonePermission() {
            return hasMicPermission();
        }

        /** Opens the tablet's voice settings (where the offline English pack is downloaded). */
        @JavascriptInterface
        public void openVoiceSettings() {
            main.post(() -> {
                try {
                    startActivity(new Intent(Settings.ACTION_VOICE_INPUT_SETTINGS));
                } catch (Exception e) {
                    try {
                        startActivity(new Intent(Settings.ACTION_SETTINGS));
                    } catch (Exception ignored) { }
                }
            });
        }
    }

    // ------------------------------------------------------------------
    // Pausing / closing
    // ------------------------------------------------------------------

    @Override
    protected void onPause() {
        muteBeep(false);
        if (!popupActive) {           // Google's pop-up briefly pauses the app - keep going
            abortListening();
            stopSpeaking();
            if (webView != null) webView.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        ensureSoundOn();
        if (webView != null) webView.onResume();
        hideSystemBars();
    }

    @Override
    protected void onDestroy() {
        muteBeep(false);
        stopVosk();
        resetRecognizer();
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidBuddy");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
