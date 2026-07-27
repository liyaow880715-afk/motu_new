const SESSION_VERSION = 1;
export const SESSION_COOKIE_NAME = "motu_session";
export const DEFAULT_SESSION_TTL_SECONDS = 24 * 60 * 60;

export type SessionPayload = {
  version: number;
  accessKeyId: string;
  issuedAt: number;
  expiresAt: number;
};

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importSigningKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function isSecureAppSecret(secret: string | undefined) {
  return Boolean(secret && secret.length >= 32 && secret !== "banana-mall-local-secret");
}

export function resolveSessionExpiry(expiresAt?: string | Date | null) {
  const defaultExpiry = Math.floor(Date.now() / 1000) + DEFAULT_SESSION_TTL_SECONDS;
  if (!expiresAt) return defaultExpiry;
  const explicitExpiry = Math.floor(new Date(expiresAt).getTime() / 1000);
  return Number.isFinite(explicitExpiry) ? Math.min(defaultExpiry, explicitExpiry) : defaultExpiry;
}

export async function createSessionToken(
  accessKeyId: string,
  secret: string,
  expiresAt?: string | Date | null,
) {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    version: SESSION_VERSION,
    accessKeyId,
    issuedAt: now,
    expiresAt: resolveSessionExpiry(expiresAt),
  };
  const encodedPayload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importSigningKey(secret),
    new TextEncoder().encode(encodedPayload),
  );
  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token: string, secret: string): Promise<SessionPayload | null> {
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await importSigningKey(secret),
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(encodedPayload),
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload))) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (
      payload.version !== SESSION_VERSION ||
      !payload.accessKeyId ||
      !Number.isFinite(payload.issuedAt) ||
      !Number.isFinite(payload.expiresAt) ||
      payload.issuedAt > now + 60 ||
      payload.expiresAt <= now
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
