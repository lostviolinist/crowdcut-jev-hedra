import { DurableObject } from "cloudflare:workers";
import { launch } from "@cloudflare/playwright";
import { makeLiveComment, makeLiveName } from "../../lib/demo-comments";

type Env = {
  BROWSER: Fetcher;
  STORY: DurableObjectNamespace<StoryProducer>;
  SITE_ORIGIN: string;
  CROWDCUT_PRODUCER_SECRET: string;
};

type Snapshot = {
  running: boolean;
  phase: string;
  round: number;
  generation: number;
  sceneCount: number;
};

type ChatCursor = { generation: number; round: number; nextIndex: number; nextAt: number };
type FrameLease = { generation: number; sceneCount: number; expiresAt: number };
type ProducerStatus = { checkedAt: number; running: boolean; phase: string; round: number; sceneCount: number; error?: string };

const OPENING_FRAME = "/opening-frame-sophie.png";
const MAX_COMMENTS_PER_ROUND = 500;

function auth(env: Env) {
  return { Authorization: `Bearer ${env.CROWDCUT_PRODUCER_SECRET}` };
}

async function requireOk(response: Response, operation: string) {
  if (!response.ok) throw new Error(`${operation} failed (${response.status}): ${(await response.text()).slice(0, 250)}`);
  return response;
}

async function snapshot(env: Env): Promise<Snapshot> {
  const response = await requireOk(await fetch(`${env.SITE_ORIGIN}/api/live`, { headers: { "Cache-Control": "no-cache" } }), "Read story");
  return response.json() as Promise<Snapshot>;
}

async function tick(env: Env) {
  await requireOk(await fetch(`${env.SITE_ORIGIN}/api/live/tick`, { method: "POST", headers: auth(env) }), "Tick story");
}

// Browser Run uses the same HTML video seek/canvas handoff as the former
// owner tab. This preserves the 0.5-second-before-end visual continuation.
async function videoFrame(env: Env, number: number, generation: number) {
  const browser = await launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.goto(`${env.SITE_ORIGIN}/api/live`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async ({ url }) => {
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.src = url;
      const wait = (event: "loadedmetadata" | "seeked") => new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => finish(new Error(`Timed out waiting for ${event}`)), 20000);
        const finish = (error?: Error) => {
          window.clearTimeout(timer);
          video.removeEventListener(event, loaded);
          video.removeEventListener("error", failed);
          error ? reject(error) : resolve();
        };
        const loaded = () => finish();
        const failed = () => finish(new Error("Video could not be decoded"));
        video.addEventListener(event, loaded);
        video.addEventListener("error", failed);
      });
      try {
        const metadata = wait("loadedmetadata");
        video.load();
        await metadata;
        if (!Number.isFinite(video.duration) || !video.videoWidth || !video.videoHeight) throw new Error("No decodable video frame");
        const small = document.createElement("canvas");
        small.width = 64;
        small.height = 36;
        const smallContext = small.getContext("2d");
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d");
        if (!context || !smallContext) throw new Error("Canvas unavailable");
        let bestTime = Math.max(0, video.duration - 0.5);
        let bestScore = -1;
        for (const secondsBeforeEnd of [0.5, 0.8, 1.3]) {
          const time = Math.max(0, video.duration - secondsBeforeEnd);
          const seeked = wait("seeked");
          video.currentTime = time;
          await seeked;
          smallContext.drawImage(video, 0, 0, 64, 36);
          const pixels = smallContext.getImageData(0, 0, 64, 36).data;
          let brightness = 0;
          for (let i = 0; i < pixels.length; i += 4) brightness += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
          const score = brightness / (pixels.length / 4);
          if (score > bestScore) { bestScore = score; bestTime = time; }
          if (score >= 55) break;
        }
        if (Math.abs(video.currentTime - bestTime) > 0.01) {
          const seeked = wait("seeked");
          video.currentTime = bestTime;
          await seeked;
        }
        context.drawImage(video, 0, 0);
        return { dataUrl: canvas.toDataURL("image/png"), cutMs: Math.min(8000, Math.max(500, Math.round(bestTime * 1000))) };
      } finally {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    }, { url: `${env.SITE_ORIGIN}/api/live/media/${number}?generation=${generation}` });
    const image = await fetch(result.dataUrl);
    return { blob: await image.blob(), cutMs: result.cutMs };
  } finally {
    await browser.close();
  }
}

async function frame(env: Env, story: Snapshot) {
  const handoff = story.sceneCount === 0
    ? { blob: await requireOk(await fetch(`${env.SITE_ORIGIN}${OPENING_FRAME}`), "Opening frame").then((response) => response.blob()), cutMs: 8000 }
    : await videoFrame(env, story.sceneCount, story.generation);
  const form = new FormData();
  form.append("sceneNumber", String(story.sceneCount));
  form.append("generation", String(story.generation));
  form.append("cutMs", String(handoff.cutMs));
  form.append("frame", handoff.blob, "scene-frame.png");
  await requireOk(await fetch(`${env.SITE_ORIGIN}/api/live/frame`, { method: "POST", headers: auth(env), body: form }), "Upload handoff frame");
  await tick(env);
}

export class StoryProducer extends DurableObject<Env> {
  async fetch(request: Request) {
    if (!this.env.CROWDCUT_PRODUCER_SECRET) return new Response("Producer not configured", { status: 503 });
    if (request.headers.get("authorization") !== `Bearer ${this.env.CROWDCUT_PRODUCER_SECRET}`) return new Response("Forbidden", { status: 403 });
    if (new URL(request.url).pathname === "/status") {
      return Response.json({ status: await this.ctx.storage.get<ProducerStatus>("status") || null, nextAlarmAt: await this.ctx.storage.getAlarm() });
    }
    await this.ctx.storage.setAlarm(Date.now() + 50);
    return Response.json({ awake: true });
  }

  async alarm() {
    let delay: number | null = 5000;
    try {
      const story = await snapshot(this.env);
      const previous = await this.ctx.storage.get<ProducerStatus>("status");
      if (!previous || previous.phase !== story.phase || previous.running !== story.running || Date.now() - previous.checkedAt > 10000) {
        await this.ctx.storage.put("status", { checkedAt: Date.now(), running: story.running, phase: story.phase, round: story.round, sceneCount: story.sceneCount });
      }
      if (!story.running) { delay = null; return; }
      delay = 800;
      await tick(this.env);

      const old = await this.ctx.storage.get<ChatCursor>("chat");
      const chat = old?.generation === story.generation && old.round === story.round
        ? old : { generation: story.generation, round: story.round, nextIndex: 0, nextAt: 0 };
      if (Date.now() >= chat.nextAt && chat.nextIndex < MAX_COMMENTS_PER_ROUND) {
        const first = chat.nextIndex;
        const count = Math.min(first < 24 ? 4 : 2, MAX_COMMENTS_PER_ROUND - first);
        chat.nextIndex += count;
        chat.nextAt = Date.now() + (first < 24 ? 500 + Math.random() * 400 : 750 + Math.random() * 450);
        await this.ctx.storage.put("chat", chat);
        this.ctx.waitUntil(Promise.all(Array.from({ length: count }, async (_, offset) => {
          await new Promise((resolve) => setTimeout(resolve, offset * (70 + Math.random() * 80)));
          const index = first + offset;
          const response = await fetch(`${this.env.SITE_ORIGIN}/api/live/comments`, {
            method: "POST",
            headers: { ...auth(this.env), "Content-Type": "application/json" },
            body: JSON.stringify({ body: makeLiveComment(index, story.round), name: makeLiveName(index, story.round), synthetic: true }),
          });
          if (!response.ok && response.status !== 429 && response.status !== 409) throw new Error(`Comment ${index} failed (${response.status})`);
        })).catch((error) => console.error("Comment wave failed", error)));
      }

      if (story.phase === "awaiting_frame") {
        const lease = await this.ctx.storage.get<FrameLease>("frameLease");
        if (!lease || lease.generation !== story.generation || lease.sceneCount !== story.sceneCount || lease.expiresAt < Date.now()) {
          const claimed: FrameLease = { generation: story.generation, sceneCount: story.sceneCount, expiresAt: Date.now() + 60000 };
          await this.ctx.storage.put("frameLease", claimed);
          this.ctx.waitUntil(frame(this.env, story).catch((error) => console.error("Frame handoff failed", error)).finally(async () => {
            const current = await this.ctx.storage.get<FrameLease>("frameLease");
            if (current?.generation === claimed.generation && current.sceneCount === claimed.sceneCount && current.expiresAt === claimed.expiresAt) {
              await this.ctx.storage.delete("frameLease");
            }
          }));
        }
      }
    } catch (error) {
      console.error("Producer alarm failed", error);
      await this.ctx.storage.put("status", { checkedAt: Date.now(), running: false, phase: "error", round: 0, sceneCount: 0, error: error instanceof Error ? error.message : "Unknown producer error" });
    } finally {
      if (delay !== null) await this.ctx.storage.setAlarm(Date.now() + delay);
    }
  }
}

function storyObject(env: Env) {
  return env.STORY.get(env.STORY.idFromName("one-shared-story"));
}

export default {
  async fetch(request: Request, env: Env) {
    const path = new URL(request.url).pathname;
    if (path === "/health") return Response.json({ service: "crowdcut-producer", status: "deployed" });
    if (!env.CROWDCUT_PRODUCER_SECRET) return new Response("Producer not configured", { status: 503 });
    if (request.headers.get("authorization") !== `Bearer ${env.CROWDCUT_PRODUCER_SECRET}`) return new Response("Forbidden", { status: 403 });
    if (path === "/wake" && request.method === "POST") return storyObject(env).fetch(request);
    if (path === "/status" && request.method === "GET") return storyObject(env).fetch(request);
    if (path === "/check" && request.method === "POST") {
      await tick(env);
      return Response.json({ siteTick: "ok" });
    }
    if (path === "/probe" && request.method === "POST") {
      const input = await request.json() as { sceneNumber?: number; generation?: number };
      if (!Number.isInteger(input.sceneNumber) || !input.sceneNumber || !Number.isInteger(input.generation)) return new Response("Bad scene", { status: 400 });
      const result = await videoFrame(env, input.sceneNumber, input.generation!);
      return Response.json({ ok: true, bytes: result.blob.size, cutMs: result.cutMs });
    }
    return new Response("Not found", { status: 404 });
  },
  async scheduled(_event: ScheduledEvent, env: Env) {
    if (!env.CROWDCUT_PRODUCER_SECRET) return;
    await storyObject(env).fetch(new Request("https://producer.internal/wake", { method: "POST", headers: auth(env) }));
  },
};
