// AES-256-GCM envelope encryption for webhook signing secrets.
// Stored format: "<base64(iv)>:<base64(ciphertext)>"
// WEBHOOK_SIGNING_KEY env var must be a base64-encoded 32-byte random key.

async function importKey(base64Key: string): Promise<CryptoKey> {
  let decoded: string;
  try {
    decoded = atob(base64Key.trim());
  } catch {
    throw new Error("WEBHOOK_SIGNING_KEY must be valid base64.");
  }
  if (decoded.length !== 32) {
    throw new Error("WEBHOOK_SIGNING_KEY must decode to exactly 32 bytes.");
  }
  const raw = new Uint8Array(32);
  for (let i = 0; i < 32; i++) raw[i] = decoded.charCodeAt(i);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptWebhookSecret(plaintext: string, base64Key: string): Promise<string> {
  const key = await importKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  const ivB64 = btoa(String.fromCharCode(...iv));
  const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
  return `${ivB64}:${ctB64}`;
}

export async function decryptWebhookSecret(stored: string, base64Key: string): Promise<string> {
  const parts = stored.split(":");
  if (parts.length !== 2) throw new Error("Invalid stored secret format.");
  const [ivB64, ctB64] = parts;

  const key = await importKey(base64Key);
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));

  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
