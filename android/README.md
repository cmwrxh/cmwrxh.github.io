# AfricaLatency Android (Trusted Web Activity)

This directory prepares the Android wrapper configuration for the existing AfricaLatency PWA. It does not replace the web application or its authentication/scan backend.

## Important status

- Package ID planned: `dev.africalatency.app`. Confirm this ID is not already used by an existing Play Console app before first release; changing it later creates a different Android app.
- The config template is not a generated Android Studio project or a signed build.
- Do not commit an Android keystore, keystore passwords, Play service-account JSON, or other signing credentials.
- Digital Asset Links must not be published until the final release signing certificate SHA-256 fingerprint is known. If Play App Signing is enabled, use the Play Console app-signing certificate fingerprint for production verification.
- The domain must keep serving the PWA manifest, icons, and service worker over HTTPS.

## Generate the project

Use a machine with Node.js, Java, and Android SDK access. Run the official Bubblewrap initializer interactively so it can validate the live web manifest and create a signing key securely:

```bash
npm install --global @bubblewrap/cli
mkdir -p android
bubblewrap init --manifest=https://africalatency.dev/manifest.json --directory=android
```

When prompted, use the package ID above if it is available, app name `AfricaLatency`, launcher name `AfricaLatency`, and the dark brand color `#0E131A`. Keep the generated signing keystore outside version control and back it up securely. The interactive initializer will create the generated Android project files and a real `twa-manifest.json`; the JSON file in this repository is a reference template only.

After initialization, review the generated `android/twa-manifest.json` against `twa-manifest.template.json` and then build:

```bash
cd android
bubblewrap build
```

Bubblewrap produces a signed APK for device testing and an Android App Bundle for Play Console. Test the APK on a physical Android device before release. Do not publish the AAB until Digital Asset Links, sign-in, scan/report navigation, app identity, privacy disclosures, and Play Console requirements are verified.

## Manual smoke test

1. Install the test APK on an Android phone.
2. Launch the app and confirm it opens `https://africalatency.dev/` with the intended AfricaLatency identity.
3. Test Google sign-in and sign-out.
4. Run a real scan and open its report.
5. Confirm report/dashboard content is not cached for offline use.
6. Disable network access and confirm the PWA's offline fallback appears without exposing account or scan data.
7. Test navigation to any external origin; it should leave the trusted full-screen experience rather than impersonate AfricaLatency.

## Reference

Bubblewrap CLI documentation: https://github.com/GoogleChromeLabs/bubblewrap
