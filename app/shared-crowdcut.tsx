"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUp, Clapperboard, Pause, Play, Radio, SkipForward } from "lucide-react";
import { demoNames, makeLiveComment } from "@/lib/demo-comments";
import { captureLastSceneFrameFromUrl } from "@/lib/scene-frame";
import { OPENING_FRAME_PATH, STORY_TITLE } from "@/lib/story";

type Scene = { number: number; action: string; created_at: number };
type ChatComment = { id: number; name: string; body: string; action: string | null; created_at: number };
type Idea = { id: string; action: string; votes: number };
type Snapshot = {
  running: boolean; phase: string; round: number; sceneCount: number; pendingAction: string | null;
  error: string | null; scenes: Scene[]; comments: ChatComment[]; ideas: Idea[];
  isOwner: boolean; canComment: boolean;
};

const SCENE_SECONDS = 8;
const MAX_SIMULATED_PER_ROUND = 25;
const accents = ["#a970ff", "#39e6c5", "#ff7d9e", "#6fb8ff"];

function mediaUrl(number: number) { return `/api/live/media/${number}`; }
function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function SharedCrowdCut() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commentFeedback, setCommentFeedback] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);
  const [simulate, setSimulate] = useState(true);
  const [selectedScene, setSelectedScene] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [followLive, setFollowLive] = useState(true);
  const [frameRetry, setFrameRetry] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const seekRef = useRef<number | null>(null);
  const knownScenesRef = useRef(0);
  const frameUploadingRef = useRef(false);
  const commentIndexRef = useRef(0);
  const simulatedThisRoundRef = useRef(0);
  const simulatedInFlightRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/live", { cache: "no-store" });
      const result = await response.json() as Snapshot & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load the live story.");
      setSnapshot(result);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the live story.");
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 2000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);

  useEffect(() => {
    if (!snapshot?.isOwner) return;
    const tick = () => void fetch("/api/live/tick", { method: "POST" }).catch(() => {});
    tick();
    const timer = window.setInterval(tick, 1500);
    return () => window.clearInterval(timer);
  }, [snapshot?.isOwner]);

  useEffect(() => {
    if (!snapshot?.isOwner || snapshot.phase !== "awaiting_frame" || frameUploadingRef.current) return;
    frameUploadingRef.current = true;
    const upload = async () => {
      try {
        const blob = snapshot.sceneCount === 0
          ? await fetch(OPENING_FRAME_PATH).then((response) => { if (!response.ok) throw new Error("Opening frame unavailable."); return response.blob(); })
          : await captureLastSceneFrameFromUrl(mediaUrl(snapshot.sceneCount));
        const form = new FormData();
        form.append("sceneNumber", String(snapshot.sceneCount));
        form.append("frame", blob, "scene-frame.png");
        const response = await fetch("/api/live/frame", { method: "POST", body: form });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || "Could not prepare the next frame.");
        void load();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not prepare the next frame.");
        window.setTimeout(() => setFrameRetry((value) => value + 1), 3000);
      } finally {
        frameUploadingRef.current = false;
      }
    };
    void upload();
  }, [snapshot?.isOwner, snapshot?.phase, snapshot?.sceneCount, frameRetry, load]);

  useEffect(() => {
    if (!snapshot?.isOwner || !snapshot.running || !simulate) return;
    let timer: number | undefined;
    const round = snapshot.round;
    simulatedThisRoundRef.current = 0;
    const sendNext = () => {
      if (simulatedThisRoundRef.current >= MAX_SIMULATED_PER_ROUND) return;
      if (simulatedInFlightRef.current < 5) {
        const index = commentIndexRef.current++;
        simulatedThisRoundRef.current++;
        simulatedInFlightRef.current++;
        void fetch("/api/live/comments", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: makeLiveComment(index, round), name: demoNames[index % demoNames.length], synthetic: true }),
        }).catch(() => {}).finally(() => { simulatedInFlightRef.current--; });
      }
      timer = window.setTimeout(sendNext, 500 + Math.random() * 900 + (Math.random() < 0.15 ? 700 : 0));
    };
    timer = window.setTimeout(sendNext, 700);
    return () => { if (timer) window.clearTimeout(timer); };
  }, [snapshot?.isOwner, snapshot?.running, snapshot?.round, simulate]);

  useEffect(() => {
    const count = snapshot?.scenes.length || 0;
    if (count > knownScenesRef.current && followLive) {
      if (knownScenesRef.current === 0 || videoRef.current?.ended || playhead >= knownScenesRef.current * SCENE_SECONDS - 0.2) {
        seekRef.current = 0;
        setSelectedScene(count - 1);
        setPlayhead((count - 1) * SCENE_SECONDS);
      }
    }
    knownScenesRef.current = count;
  }, [snapshot?.scenes.length, followLive, playhead]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) void video.play().catch(() => setPlaying(false));
    else video.pause();
  }, [playing, selectedScene]);

  const scenes = snapshot?.scenes || [];
  const activeScene = scenes[selectedScene];
  const totalDuration = scenes.length * SCENE_SECONDS;
  const currentRoundVotes = snapshot?.ideas.reduce((sum, idea) => sum + idea.votes, 0) || 0;

  function seekTo(value: number) {
    if (!scenes.length) return;
    const time = Math.min(Math.max(0, value), Math.max(0, totalDuration - 0.05));
    const index = Math.min(scenes.length - 1, Math.floor(time / SCENE_SECONDS));
    const offset = time - index * SCENE_SECONDS;
    setFollowLive(false);
    setPlayhead(time);
    seekRef.current = offset;
    if (index === selectedScene && videoRef.current?.readyState) videoRef.current.currentTime = offset;
    else setSelectedScene(index);
  }

  function goLive() {
    if (!scenes.length) return;
    setFollowLive(true);
    setPlaying(true);
    seekRef.current = 0;
    setSelectedScene(scenes.length - 1);
    setPlayhead((scenes.length - 1) * SCENE_SECONDS);
    if (selectedScene === scenes.length - 1 && videoRef.current) videoRef.current.currentTime = 0;
  }

  async function control(action: "start" | "stop") {
    setControlBusy(true);
    try {
      const response = await fetch("/api/live/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not change the story state.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change the story state.");
    } finally { setControlBusy(false); }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setCommentFeedback(null);
    setDraft("");
    try {
      const response = await fetch("/api/live/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
      const result = await response.json() as { error?: string; usable?: boolean };
      if (!response.ok) throw new Error(result.error || "Your suggestion could not be sent.");
      if (!result.usable) setCommentFeedback("Jev read your comment, but did not find a story direction in it.");
      await load();
    } catch (caught) {
      setDraft(body);
      setCommentFeedback(caught instanceof Error ? caught.message : "Your suggestion could not be sent.");
    } finally { setSending(false); }
  }

  return <main className="min-h-screen bg-[#0e0e10] text-[#efeff1]">
    <header className="flex items-center gap-3 border-b border-white/10 bg-[#121214] px-4 py-3">
      <span className="grid size-9 place-items-center rounded-md bg-[#9147ff]"><Clapperboard size={19} /></span>
      <div className="min-w-0"><strong className="text-sm">CrowdCut</strong><span className="ml-2 text-sm text-white/55">/ {STORY_TITLE}</span></div>
      <span className="ml-auto flex items-center gap-2 text-xs text-white/60"><Radio size={14} className="text-[#e91916]" />{snapshot?.running ? "Live story" : "Story paused"}</span>
      {snapshot?.isOwner && <button type="button" disabled={controlBusy} onClick={() => void control(snapshot.running ? "stop" : "start")} className="rounded border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-50">{snapshot.running ? "Stop generation" : "Start generation"}</button>}
    </header>
    {(commentFeedback || error || snapshot?.error) && <div role="alert" className="border-b border-rose-400/25 bg-rose-400/10 px-5 py-3 text-sm text-rose-100">{commentFeedback || error || snapshot?.error}</div>}
    <div className="mx-auto grid max-w-[1700px] lg:grid-cols-[minmax(0,1fr)_370px]">
      <section className="min-w-0 p-4 sm:p-6"><div className="mx-auto max-w-[1120px]">
        <div className="mb-4"><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{STORY_TITLE}</h1><p className="mt-2 text-sm text-white/55">The audience chooses Sophie&apos;s next move. Watch live or catch up from the beginning.</p></div>
        <div className="relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-black shadow-2xl">
          {activeScene ? <video ref={videoRef} src={mediaUrl(activeScene.number)} playsInline autoPlay className="absolute inset-0 size-full object-cover" onLoadedMetadata={(event) => { if (seekRef.current !== null) { event.currentTarget.currentTime = seekRef.current; seekRef.current = null; } if (playing) void event.currentTarget.play().catch(() => setPlaying(false)); }} onTimeUpdate={(event) => setPlayhead(selectedScene * SCENE_SECONDS + event.currentTarget.currentTime)} onEnded={() => { if (selectedScene + 1 < scenes.length && playing) { seekRef.current = 0; setSelectedScene(selectedScene + 1); } else if (followLive) setPlayhead(totalDuration); }} /> : <Image src={OPENING_FRAME_PATH} alt="Sophie opens the door of a moving castle." fill priority className="object-cover" sizes="(max-width: 1024px) 100vw, 70vw" />}
          <span className="absolute left-4 top-4 rounded bg-[#e91916] px-2 py-1 text-[11px] font-bold tracking-wider">{snapshot?.running ? "LIVE STORY" : "STORY PAUSED"}</span>
          {!activeScene && <div className="absolute bottom-5 left-5 rounded bg-black/65 px-3 py-2 text-sm">{snapshot?.running ? "The first scene is taking shape…" : "Waiting for the story to begin"}</div>}
        </div>
        <div className="mt-3 rounded border border-white/10 bg-[#18181b] p-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setPlaying((value) => !value)} disabled={!activeScene} aria-label={playing ? "Pause your playback" : "Play with sound"} className="rounded bg-white/10 p-2 disabled:opacity-40">{playing ? <Pause size={17} /> : <Play size={17} />}</button>
            <span className="shrink-0 text-xs tabular-nums text-white/65">{formatTime(playhead)} / {formatTime(totalDuration)}</span>
            <input type="range" aria-label="Story timeline" min={0} max={Math.max(totalDuration, 0.1)} step={0.1} value={Math.min(playhead, Math.max(totalDuration, 0.1))} onChange={(event) => seekTo(Number(event.target.value))} disabled={!activeScene} className="min-w-0 flex-1 accent-[#9147ff]" />
            <button type="button" onClick={goLive} disabled={!activeScene} className="flex shrink-0 items-center gap-1 rounded bg-[#9147ff]/20 px-2 py-1.5 text-xs font-semibold text-[#bf94ff] disabled:opacity-40"><SkipForward size={14} /> Go live</button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div><p className="text-white/80">{activeScene ? `Scene ${activeScene.number}: ${activeScene.action}` : "Opening scene"}</p>{snapshot?.pendingAction && <p className="text-[#bf94ff]">Audience chose next: {snapshot.pendingAction}</p>}</div>
            <span className="text-xs text-white/45">H3 Max Turbo · 480p · 8s · {scenes.length} scene{scenes.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div className="mb-3 mt-7"><h2 className="text-lg font-semibold">Audience directions</h2><p className="text-sm text-white/45">Jev groups the current wave of suggestions; the leading direction becomes the next scene.</p></div>
        {snapshot?.ideas.length ? <div className="grid gap-3 sm:grid-cols-2">{snapshot.ideas.map((idea, index) => <div key={idea.id} className="rounded-lg border border-white/10 bg-[#18181b] p-4"><div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded" style={{ background: accents[index] + "22", color: accents[index] }}>{index + 1}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{idea.action}</p><div className="mt-3 h-1 rounded bg-white/10"><div className="h-1 rounded" style={{ width: Math.round(idea.votes / currentRoundVotes * 100) + "%", background: accents[index] }} /></div></div><span className="text-sm font-bold" style={{ color: accents[index] }}>{idea.votes}</span></div></div>)}</div> : <div className="rounded-lg border border-dashed border-white/15 bg-[#18181b] p-6 text-center text-sm text-white/45">The next audience directions are taking shape.</div>}
        {snapshot?.isOwner && <label className="mt-4 flex items-center gap-2 text-xs text-white/50"><input type="checkbox" checked={simulate} onChange={(event) => setSimulate(event.target.checked)} className="accent-[#9147ff]" /> Add simulated chat for testing</label>}
      </div></section>
      <aside className="flex min-h-[520px] flex-col border-t border-white/10 bg-[#18181b] lg:h-[calc(100vh-64px)] lg:border-l lg:border-t-0">
        <div className="border-b border-white/10 px-4 py-3"><h2 className="text-sm font-semibold">Live chat</h2><p className="mt-0.5 text-xs text-white/40">Your suggestions join the same story everyone is watching.</p></div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">{snapshot?.comments.length ? snapshot.comments.map((comment) => <div key={comment.id} className="text-sm leading-snug"><span className="mr-2 font-semibold text-[#bf94ff]">{comment.name}</span><span className="text-white/75">{comment.body}</span><p className="mt-1 text-[11px] text-white/35">Jev → {comment.action}</p></div>) : <p className="pt-8 text-center text-sm text-white/35">The audience is arriving…</p>}</div>
        {snapshot?.canComment ? <form onSubmit={submitComment} className="flex gap-2 border-t border-white/10 bg-[#18181b] p-3"><input value={draft} onChange={(event) => { setDraft(event.target.value); setCommentFeedback(null); }} maxLength={500} placeholder="Suggest what Sophie does next…" disabled={!snapshot.running || sending} className="min-w-0 flex-1 rounded border border-white/10 bg-[#0e0e10] px-3 py-2 text-sm outline-none focus:border-[#9147ff] disabled:opacity-50" /><button type="submit" disabled={!draft.trim() || !snapshot.running || sending} className="rounded bg-[#9147ff] px-3 disabled:opacity-40" aria-label="Send suggestion"><ArrowUp size={17} /></button></form> : <a href="/signin-with-chatgpt?return_to=%2F" target="_top" className="border-t border-white/10 p-4 text-center text-sm text-[#bf94ff]">Sign in to comment</a>}
      </aside>
    </div>
  </main>;
}
