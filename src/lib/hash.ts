export async function contentHash(...parts: (string | null | undefined)[]): Promise<string> {
  const content = parts.filter(Boolean).join("|");
  const encoded = new TextEncoder().encode(content);
  const buf = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
