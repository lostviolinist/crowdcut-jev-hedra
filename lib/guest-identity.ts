const COOKIE_NAME = "crowdcut_guest";
const COOKIE_AGE_SECONDS = 60 * 60 * 24 * 30;
const first = ["amber", "cloud", "echo", "fern", "lilac", "lumen", "maple", "moss", "moon", "orbit", "paper", "pebble", "pixel", "rune", "velvet", "violet"];
const second = ["aster", "beacon", "clover", "comet", "fox", "lantern", "moth", "otter", "pocket", "rabbit", "sparrow", "sprite", "static", "teacup", "whisper", "willow"];

export type GuestIdentity = { userId: string; name: string; ipPrefix: string | null; setCookie?: string };

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  const bytes = new Uint8Array(new ArrayBuffer(32));
  for (let index = 0; index < bytes.length; index++) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

async function signingKey(): Promise<CryptoKey | null> {
  const secret = process.env.CROWDCUT_GUEST_SECRET?.trim();
  if (!secret || secret.length < 32) return null;
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function signature(key: CryptoKey, value: string): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

function cookieValue(request: Request): string | null {
  const entry = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  return entry ? entry.slice(COOKIE_NAME.length + 1) : null;
}

export async function guestIdentity(request: Request, create: boolean): Promise<GuestIdentity | null> {
  const key = await signingKey();
  if (!key) return null;
  const stored = cookieValue(request);
  const parts = stored?.split(".");
  let id: string | null = null;
  if (parts?.length === 2 && /^[0-9a-f-]{36}$/.test(parts[0])) {
    const mac = hexToBytes(parts[1]);
    if (mac && await crypto.subtle.verify("HMAC", key, mac, new TextEncoder().encode(parts[0]))) id = parts[0];
  }
  if (!id && !create) return null;
  const fresh = !id;
  id ||= crypto.randomUUID();
  const handle = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`handle:${id}`)));
  const name = `${first[handle[0] % first.length]}_${second[handle[1] % second.length]}${bytesToHex(handle.slice(2, 4))}`;
  // Cloudflare supplies the visitor IP at its edge. Store only a keyed digest,
  // never the raw address. The per-IP ceiling resists cookie-reset flooding.
  const ip = request.headers.get("cf-connecting-ip")?.trim();
  const ipHash = ip ? (await signature(key, `ip:${ip}`)).slice(0, 20) : null;
  const ipPrefix = ipHash ? `guest:${ipHash}:` : null;
  const userId = `${ipPrefix || "guest:unknown:"}${id}`;
  const setCookie = fresh
    ? `${COOKIE_NAME}=${id}.${await signature(key, id)}; Path=/; Max-Age=${COOKIE_AGE_SECONDS}; HttpOnly; SameSite=Lax${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`
    : undefined;
  return { userId, name, ipPrefix, setCookie };
}
