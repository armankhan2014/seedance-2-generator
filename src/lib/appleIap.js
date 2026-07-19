import crypto from "crypto";

// Apple StoreKit 2 transaction verification — no Apple API key required.
//
// StoreKit 2 hands the app a *signed* JWS for every transaction. The JWS
// header carries the full certificate chain (x5c: leaf → intermediate →
// root) that Apple used to sign it. Verifying it is entirely offline:
//
//   1. the chain must terminate at Apple Root CA - G3 (pinned below —
//      compared byte-for-byte, so a self-signed "Apple Root CA - G3"
//      forgery fails),
//   2. each certificate must be signed by the next one up and be within
//      its validity window,
//   3. the JWS signature itself must verify against the leaf's public key.
//
// That's why this project uses no RevenueCat / App Store Server API key:
// there is no secret to store or rotate. See docs "Verifying a signed
// transaction" in Apple's App Store Server API guide.

// Apple Root CA - G3 (SHA-256 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:
// 7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79), from
// https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
const APPLE_ROOT_CA_G3 = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

export const APP_BUNDLE_ID = "com.visualseffect.seedance";

// Apple product id → credits granted. Mirrors the App Store Connect
// consumables (credits450 … credits15750) and the web Stripe packs in
// src/app/api/stripe/checkout/route.js, at iOS-specific prices that
// absorb Apple's 15–30% commission.
export const IAP_PRODUCTS = {
  credits450:   450,
  credits1350:  1350,
  credits3150:  3150,
  credits6750:  6750,
  credits15750: 15750,
};

function b64urlToBuffer(part) {
  return Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function derToX509(derBase64) {
  const body = derBase64.match(/.{1,64}/g).join("\n");
  return new crypto.X509Certificate(
    `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----`
  );
}

/**
 * Verify an Apple-signed JWS transaction and return its decoded payload.
 * Throws on any signature, chain, bundle or expiry problem — callers should
 * treat a throw as "this purchase is not real".
 */
export function verifyAppleTransaction(jws) {
  if (typeof jws !== "string") throw new Error("Missing transaction");
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("Malformed transaction");
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(b64urlToBuffer(headerB64).toString("utf8"));
  if (header.alg !== "ES256") throw new Error(`Unexpected algorithm ${header.alg}`);
  if (!Array.isArray(header.x5c) || header.x5c.length < 2) {
    throw new Error("Transaction has no certificate chain");
  }

  const chain = header.x5c.map(derToX509);
  const root = chain[chain.length - 1];

  // 1. pin the root — raw DER comparison, not a name/fingerprint string
  const pinnedRoot = new crypto.X509Certificate(APPLE_ROOT_CA_G3);
  if (!root.raw.equals(pinnedRoot.raw)) {
    throw new Error("Certificate chain is not rooted at Apple Root CA - G3");
  }

  // 2. every certificate signed by its issuer, and currently valid
  const now = Date.now();
  for (let i = 0; i < chain.length; i++) {
    const cert = chain[i];
    if (now < Date.parse(cert.validFrom) || now > Date.parse(cert.validTo)) {
      throw new Error("Certificate in chain is expired or not yet valid");
    }
    const issuer = chain[i + 1];
    if (issuer && !cert.verify(issuer.publicKey)) {
      throw new Error("Certificate chain signature check failed");
    }
  }

  // 3. the JWS signature itself. JWS ES256 signatures are raw r||s, which
  // node accepts via dsaEncoding 'ieee-p1363' (default would be DER).
  const signed = Buffer.from(`${headerB64}.${payloadB64}`, "ascii");
  const ok = crypto.verify(
    "sha256",
    signed,
    { key: chain[0].publicKey, dsaEncoding: "ieee-p1363" },
    b64urlToBuffer(signatureB64)
  );
  if (!ok) throw new Error("Transaction signature is invalid");

  const payload = JSON.parse(b64urlToBuffer(payloadB64).toString("utf8"));

  // 4. it must be OUR app's purchase
  if (payload.bundleId !== APP_BUNDLE_ID) {
    throw new Error(`Transaction is for a different app (${payload.bundleId})`);
  }
  if (payload.revocationDate) throw new Error("Transaction was revoked");

  return payload;
}
