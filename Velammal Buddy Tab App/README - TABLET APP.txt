VELAMMAL BUDDY — TABLET APP (Android)
=====================================

This folder is SEPARATE from the laptop version. Nothing in the laptop files
was changed. Inside the app, Buddy works WITHOUT INTERNET:
  - Buddy's screens, answers, quiz, goodbye  -> stored inside the app
  - Buddy's voice                              -> the tablet's own voice (offline)
  - Listening to Gugan                         -> Android's offline speech recogniser
                                                  (needs a free one-time download, step B)

WHAT'S IN THIS FOLDER
  VelammalBuddyApp/                    the Android app project (source)
    app/src/main/assets/www/           Buddy's page inside the app (a copy of the
                                       laptop version + android-bridge.js)
    app/src/main/java/.../MainActivity.java   microphone + voice for the tablet
  VelammalBuddy.apk                    the app to install (added once it is built)


A. GET THE APP (APK) BUILT — one time
   Option 1: GitHub builds it (Claude can do this for you once GitHub is
             connected — you just download the APK).
   Option 2: Android Studio on the laptop:
             1. Install Android Studio (free) from developer.android.com/studio
             2. File > Open > choose the "VelammalBuddyApp" folder. Wait for it
                to finish "syncing" (first time downloads ~1 GB).
             3. Build > Build App Bundle(s) / APK(s) > Build APK(s)
             4. Click "locate" - the file is app-debug.apk. Rename it to
                VelammalBuddy.apk.


B. ONE-TIME TABLET SETUP (with Wi-Fi ON)
   1. Play Store: update "Google", "Google Chrome" and
      "Android System WebView" (if listed).
   2. Download the OFFLINE English speech pack:
        Settings > General management > Language and input >
        On-screen keyboard (or "Virtual keyboard") > Google voice typing >
        Offline speech recognition > ALL tab > download "English (India)"
        (also "English (US)" to be safe).
      If you can't find it: open Buddy, hold the logo 2 seconds, tap
      "Offline speech settings".
   3. Make sure the tablet's voice works offline:
        Settings > General management > Language and input >
        Text-to-speech > preferred engine (Google or Samsung) > settings >
        Install voice data > English (India) or English (US).


C. INSTALL THE APP ON THE TABLET
   1. Copy VelammalBuddy.apk to the tablet (USB cable, Google Drive, or send
      it to yourself on WhatsApp).
   2. Open it from "My Files" / Downloads. When asked, allow
      "Install unknown apps" for that app, then tap Install.
      (If Play Protect warns "unknown app", tap "Install anyway" - it is
      the app we built.)
   3. Open "Velammal Buddy" from the home screen. Tap Allow for the
      microphone.


D. TEST WITHOUT INTERNET
   Turn Wi-Fi OFF, open Buddy, tap Tap to Talk and ask
   "Why is the sky blue?". If Buddy says he can't listen without internet,
   the offline English pack (step B2) is not downloaded yet.
   Backup plan (always works offline): hold the logo for 2 seconds ->
   question buttons or Rehearsed mode.


GOOD TO KNOW
   - Everything works like the laptop: hands-free conversation, quiz,
     goodbye, chat history until the app is closed.
   - Backup mode on the tablet: press and hold the logo for 2 seconds.
   - Lite mode is on automatically, so the older tablet stays smooth.
   - The microphone "beep" is hidden automatically.
   - The app keeps the screen awake while it is open.
   - Changing questions later: edit
       VelammalBuddyApp/app/src/main/assets/www/script.js
     (same "2. KNOWLEDGE BASE" section as the laptop), then build the APK
     again and re-install it (your settings stay).
