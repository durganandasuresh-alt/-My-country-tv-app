# Step-by-Step Guide: Download & Install My Country TV on Android Mobile / Android TV / APK

This guide explains how to install and run the **My Country TV** app on any Android mobile phone, tablet, or Android TV.

---

## 🚀 Option 1: 1-Tap Android WebAPK Installation (Easiest & Fastest - Zero File Setup)

Because the app is built as a modern **Progressive Web App (PWA / WebAPK)** with offline caching, high-performance HLS streaming, and mobile touch support, Android can install it directly to your home screen as a native application without needing to install Android Studio or compile Java/Kotlin.

### Quick Step-by-Step:
1. **Ensure your PC & Android Phone are on the same Wi-Fi network.**
2. On your PC, make sure the server is running:
   ```cmd
   python "tv app.py"
   ```
   *(or double-click `MyCountryTV.bat`)*
3. Find your PC's Auto IP address (currently **`192.168.1.5`**).
4. **Scan the QR Code** displayed in the app's **Android App** modal, or open **Google Chrome** on your phone.
5. In the address bar, type:
   ```text
   http://192.168.1.5:5000
   ```
6. Tap the **three dots menu (⋮)** in the top right corner of Chrome.
7. Tap **"Install app"** or **"Add to Home screen"**.
8. Tap **Add / Install**.

✅ **Result:** A native **My Country TV** app icon will appear on your Android home screen and in your phone's app drawer! It launches fullscreen without any browser URL bar, just like an APK downloaded from Google Play.

---

## 📥 Option 2: Download Ready-To-Compile Android Studio Project (.ZIP)

We have created and included the complete native Android Studio source code ready for compilation:

1. **Direct Download Link in Web App:**
   - Click the green **Android App** button in the top navigation bar.
   - Click **Download Android Project (.ZIP)**, or download directly from:
     ```text
     http://192.168.1.5:5000/download/android-project
     ```
2. **Open in Android Studio:**
   - Extract `MyCountryTV-Android-Project.zip`.
   - The zip contains the complete project structure including `index.html` documentation and the Android WebView app (`app/src/main/assets/index.html`).
   - Open Android Studio → **Open Project** → Select the extracted folder.
3. **Build APK in 1 Click:**
   - In Android Studio, click **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**.
   - Android Studio creates:
     ```text
     app/build/outputs/apk/debug/app-debug.apk
     ```
4. Transfer `app-debug.apk` to your phone via USB, WhatsApp, or Google Drive and tap to install!

---

## 🌐 Option 3: Generate a Standalone `.apk` Online (PWABuilder / Bubblewrap)

If you want an independent `.apk` file without installing Android Studio:

### Method A: Free Cloud APK Auto Generator (PWABuilder by Microsoft)
1. If your server is hosted or exposed online (via ngrok, Cloudflare Tunnel, Render, or local network):
2. Go to [PWABuilder.com](https://www.pwabuilder.com/).
3. Enter your web app URL (e.g. `http://192.168.1.5:5000` or public URL).
4. Click **Start** → PWABuilder reads the `/static/manifest.json` and icons automatically.
5. Click **Package for Stores** → Choose **Android**.
6. Download the   Auto generated signed `.apk` file directly to your phone.
7. Open the `.apk` on your phone and tap **Install**.

### Method B:auto Generate APK locally via Google Bubblewrap CLI
1. Open PowerShell or Terminal:
   ```cmd
   npm install -g @bubblewrap/cli
   bubblewrap init --manifest="http://192.168.1.5:5000/static/manifest.json"
   bubblewrap build
   ```
2. Bubblewrap compiles a production signed `app-release-signed.apk`.
3. Transfer `app-release-signed.apk` to your phone and install.

---

## 🔍 Troubleshooting Android Connection

- **Connection Refused / Site can't be reached?**
  - Make sure your Android phone is connected to the same Wi-Fi router as your computer.
  - Check Windows Firewall: If prompted, allow Python through Private Networks.
  - Verify your computer's IP with `ipconfig` (currently `192.168.1.5`).
- **Video not playing?**
  - Android Chrome has full native HLS (`.m3u8`) and Media Source Extensions (MSE) support. The app includes the Flask proxy button (`CORS Fix`) to bypass stream geo-restrictions.
