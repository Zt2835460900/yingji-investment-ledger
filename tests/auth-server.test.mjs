import assert from "node:assert/strict";
import test from "node:test";

process.env.AUTH_SERVER_NO_LISTEN = "1";
const {
  credentialValidationError,
  isTrustedWriteOrigin,
  parseBasicAuthorization,
  safeEqual,
} = await import("../deploy/auth-server.mjs");

test("Basic credentials preserve colons in the password", () => {
  const value = Buffer.from("owner:long:password").toString("base64");
  assert.deepEqual(parseBasicAuthorization(`Basic ${value}`), {
    username: "owner",
    password: "long:password",
  });
});

test("credential comparison and policy reject weak values", () => {
  assert.equal(safeEqual("same", "same"), true);
  assert.equal(safeEqual("same", "different"), false);
  assert.match(
    credentialValidationError({
      currentPassword: "old-password",
      newUsername: "owner",
      newPassword: "short",
    }),
    /12/,
  );
  assert.equal(
    credentialValidationError({
      currentPassword: "old-password",
      newUsername: "owner",
      newPassword: "A-strong-passphrase-2026!",
    }),
    null,
  );
});

test("credential writes require the exact public origin", () => {
  assert.equal(
    isTrustedWriteOrigin({
      origin: "https://yingji.kivelo0017.xyz",
      "sec-fetch-site": "same-origin",
    }),
    true,
  );
  assert.equal(
    isTrustedWriteOrigin({
      origin: "https://evil.example",
      "sec-fetch-site": "cross-site",
    }),
    false,
  );
});
