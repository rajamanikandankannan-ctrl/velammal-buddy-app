package com.velammal.buddy;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
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
 * The page talks to this code through the "AndroidBuddy" bridge
 * (see assets/www/android-bridge.js).
 */
public class MainActivity extends Activity {

    private static final int REQUEST_MIC = 101;
    /** Hide the short "beep" Android plays when the microphone turns on. */
    private static final boolean HIDE_MIC_BEEP = true;
    /** Oldest built-in browser engine (WebView) that runs Buddy properly. */
    private static final int MIN_WEBVIEW_MAJOR = 110;

    private final Handler main = new Handler(Looper.getMainLooper());

    private WebView webView;
    private SpeechRecognizer recognizer;
    private int currentListenId = -1;
    private AudioManager audio;
    private boolean beepMuted = false;

    private TextToSpeech tts;
    private boolean ttsReady = false;
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

        setupTextToSpeech();
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
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            speechEvent(id, "error", "service-not-allowed");
            speechEvent(id, "end", null);
            return;
        }
        if (recognizer == null) {
            recognizer = SpeechRecognizer.createSpeechRecognizer(this);
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

    private void stopListening() {
        if (recognizer != null) recognizer.stopListening();
    }

    private void abortListening() {
        currentListenId = -1;
        if (recognizer != null) recognizer.cancel();
        muteBeep(false);
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

        @Override public void onBeginningOfSpeech() { }
        @Override public void onRmsChanged(float rmsdB) { }
        @Override public void onBufferReceived(byte[] buffer) { }
        @Override public void onEndOfSpeech() { }
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

    private void setupTextToSpeech() {
        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS) return;
            int result = tts.setLanguage(new Locale("en", "IN"));
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts.setLanguage(Locale.US);
            }
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String utteranceId) { ttsEvent(utteranceId, "start"); }
                @Override public void onDone(String utteranceId) { ttsEvent(utteranceId, "done"); }
                @Override public void onError(String utteranceId) { ttsEvent(utteranceId, "error"); }
                @Override public void onError(String utteranceId, int errorCode) { ttsEvent(utteranceId, "error"); }
            });
            main.post(() -> {
                ttsReady = true;
                for (String[] item : waitingToSpeak) {
                    speakNow(item[0], item[1], Float.parseFloat(item[2]), Float.parseFloat(item[3]));
                }
                waitingToSpeak.clear();
            });
        });
    }

    private void speak(String id, String text, float rate, float pitch) {
        muteBeep(false);
        if (!ttsReady) {
            waitingToSpeak.add(new String[]{id, text, String.valueOf(rate), String.valueOf(pitch)});
            return;
        }
        speakNow(id, text, rate, pitch);
    }

    private void speakNow(String id, String text, float rate, float pitch) {
        tts.setSpeechRate(rate);
        tts.setPitch(pitch);
        Bundle params = new Bundle();
        params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC);
        int ok = tts.speak(text, TextToSpeech.QUEUE_ADD, params, id);
        if (ok != TextToSpeech.SUCCESS) ttsEvent(id, "error");
    }

    private void stopSpeaking() {
        waitingToSpeak.clear();
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
        abortListening();
        stopSpeaking();
        muteBeep(false);
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
        hideSystemBars();
    }

    @Override
    protected void onDestroy() {
        muteBeep(false);
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
