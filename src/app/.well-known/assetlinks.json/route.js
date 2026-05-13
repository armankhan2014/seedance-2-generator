// Android App Links verification.
// Served at https://seedance.visualseffect.com/.well-known/assetlinks.json
//
// When the user taps a seedance.visualseffect.com link on Android, the
// OS fetches THIS file and checks that the SHA-256 fingerprint matches
// the signing cert of any app claiming to handle this domain. If it
// matches, the OS opens our app silently — no chooser dialog, no
// browser fallback. Magic.
//
// Updating the cert: if we ever re-key the keystore, regenerate the
// fingerprint with:
//   keytool -list -v -keystore release.keystore -alias seedance
// and replace the value below, redeploy.

import { NextResponse } from "next/server";

const ANDROID_PACKAGE = "com.visualseffect.seedance";

// SHA-256 fingerprint of /Users/armankhan/seedance-app/android/app/release.keystore
// (alias: seedance). DO NOT lose this — it's tied to the keystore which
// can never be regenerated for an app already in Play Store.
const RELEASE_FINGERPRINT =
  "18:C6:46:68:80:38:1C:78:B4:D2:D4:92:E4:0E:5F:D5:60:6C:01:86:F8:26:90:AE:91:F0:77:29:8A:35:13:92";

export async function GET() {
  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: ANDROID_PACKAGE,
          sha256_cert_fingerprints: [RELEASE_FINGERPRINT],
        },
      },
    ],
    {
      headers: {
        // Android caches this for 24h; allow CDN to do the same.
        "Cache-Control": "public, max-age=86400",
        "Content-Type": "application/json",
      },
    }
  );
}
