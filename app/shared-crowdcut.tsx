"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUp, Clapperboard, Pause, Play, Radio, SkipForward } from "lucide-react";
import { makeLiveComment, makeLiveName } from "@/lib/demo-comments";
import { captureSceneHandoffFromUrl } from "@/lib/scene-frame";
import { OPENING_FRAME_PATH, STORY_TITLE } from "@/lib/story";
import { locateSceneAtMs, sceneDurationMs, sceneStartMs, storyDurationMs } from "@/lib/story-timeline";

type Scene = { number: number; action: string; cut_ms: number; created_at: number };
type ChatComment = { id: number; name: string; body: string; action: string | null; created_at: number; audience: number };
type Idea = { id: string; action: string; votes: number; audienceVotes: number };
type Snapshot = {
  running: boolean; producerActive: boolean; phase: string; round: number; sceneCount: number; pendingAction: string | null;
  error: string | null; scenes: Scene[]; comments: ChatComment[]; ideas: Idea[]; classifiedCount: number;
  isOwner: boolean; canComment: boolean; commentName: string | null;
};

const MAX_TEST_COMMENTS_PER_ROUND = 75;
const MAX_TEST_COMMENTS_IN_FLIGHT = 16;
const accents = ["#a970ff", "#39e6c5", "#ff7d9e", "#6fb8ff", "#ffbd69", "#b4a8ff"];

function mediaUrl(number: number) { return `/api/live/media/${number}`; }
function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function SharedCrowdCut() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commentFeedback, setCommentFeedback] = useState<string | null>(null);
  const [lastSentId, setLastSentId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [controlBusy, setControlBusy] = useState(false);
  const [testChatEnabled, setTestChatEnabled] = useState(true);
  const [selectedScene, setSelectedScene] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [followLive, setFollowLive] = useState(true);
  const [frameRetry, setFrameRetry] = useState(0);
  const [bridgeFrame, setBridgeFrame] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [waitingForNextScene, setWaitingForNextScene] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bridgeFrameCapturedRef = useRef(false);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const seekRef = useRef<number | null>(null);
  const knownScenesRef = useRef(0);
  const frameUploadingRef = useRef(false);
  const commentIndexRef = useRef(0);
  const testCommentsThisRoundRef = useRef(0);
  const testCommentsInFlightRef = useRef(0);

  const captureBridgeFrame = useCallback(() => {
    const video = videoRef.current;
    if (bridgeFrameCapturedRef.current || !video || !video.videoWidth || !video.videoHeight || video.readyState < 2) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(video, 0, 0);
      setBridgeFrame(canvas.toDataURL("image/jpeg", 0.85));
      bridgeFrameCapturedRef.current = true;
    } catch { /* Keep the current video visible if frame capture is unavailable. */ }
  }, []);

  const switchScene = useCallback((index: number) => {
    captureBridgeFrame();
    setWaitingForNextScene(false);
    setVideoReady(false);
    setAutoplayBlocked(false);
    setSelectedScene(index);
  }, [captureBridgeFrame]);

  const tryPlay = useCallback((video: HTMLVideoElement) => {
    const source = video.currentSrc;
    void video.play().then(() => {
      if (videoRef.current === video && video.currentSrc === source) setAutoplayBlocked(false);
    }).catch((caught: unknown) => {
      // A source change can cancel an earlier play request while the next
      // scene loads. onCanPlay will retry that scene.
      if (videoRef.current !== video || video.currentSrc !== source) return;
      const name = caught instanceof Error ? caught.name : "";
      if (name === "AbortError") return;
      if (name === "NotAllowedError") {
        setAutoplayBlocked(true);
        return;
      }
      setError("This scene could not play. Try playing it again.");
    });
  }, []);

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
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [snapshot?.isOwner]);

  useEffect(() => {
    if (!snapshot?.isOwner || snapshot.phase !== "awaiting_frame" || frameUploadingRef.current) return;
    frameUploadingRef.current = true;
    const upload = async () => {
      try {
        const handoff = snapshot.sceneCount === 0
          ? { frame: await fetch(OPENING_FRAME_PATH).then((response) => { if (!response.ok) throw new Error("Opening frame unavailable."); return response.blob(); }), cutMs: 8000 }
          : await captureSceneHandoffFromUrl(mediaUrl(snapshot.sceneCount));
        const form = new FormData();
        form.append("sceneNumber", String(snapshot.sceneCount));
        form.append("cutMs", String(handoff.cutMs));
        form.append("frame", handoff.frame, "scene-frame.png");
        const response = await fetch("/api/live/frame", { method: "POST", body: form });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || "Could not prepare the next frame.");
        // With the handoff ready, submit the next job immediately if Jev has
        // already classified enough comments while the prior clip rendered.
        void fetch("/api/live/tick", { method: "POST" }).catch(() => {});
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
    if (!snapshot?.isOwner || !snapshot.running || !testChatEnabled) return;
    let timer: number | undefined;
    const round = snapshot.round;
    testCommentsThisRoundRef.current = 0;
    const sendNext = () => {
      if (testCommentsThisRoundRef.current >= MAX_TEST_COMMENTS_PER_ROUND) return;
      if (testCommentsInFlightRef.current < MAX_TEST_COMMENTS_IN_FLIGHT) {
        const index = commentIndexRef.current++;
        testCommentsThisRoundRef.current++;
        testCommentsInFlightRef.current++;
        void fetch("/api/live/comments", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: makeLiveComment(index, round), name: makeLiveName(index, round), synthetic: true }),
        }).catch(() => {}).finally(() => { testCommentsInFlightRef.current--; });
      }
      // A busy-stream cadence gives Jev enough parallel work to classify the
      // full audience wave while Hedra renders, with occasional natural gaps.
      timer = window.setTimeout(sendNext, 20 + Math.random() * 55 + (Math.random() < 0.06 ? 180 + Math.random() * 180 : 0));
    };
    timer = window.setTimeout(sendNext, 75);
    return () => { if (timer) window.clearTimeout(timer); };
  }, [snapshot?.isOwner, snapshot?.running, snapshot?.round, testChatEnabled]);

  const newestCommentId = snapshot?.comments.at(-1)?.id;
  useEffect(() => {
    const chat = chatRef.current;
    if (chat && stickToBottomRef.current) chat.scrollTop = chat.scrollHeight;
  }, [newestCommentId]);

  useEffect(() => {
    const scenes = snapshot?.scenes || [];
    const count = scenes.length;
    if (count < knownScenesRef.current) {
      seekRef.current = 0;
      setSelectedScene(0);
      setWaitingForNextScene(false);
      setBridgeFrame(null);
      setVideoReady(false);
      bridgeFrameCapturedRef.current = false;
      setPlayhead(0);
      setFollowLive(true);
    }
    if (count > knownScenesRef.current && followLive) {
      const previousEnd = sceneStartMs(scenes, knownScenesRef.current) / 1000;
      if (knownScenesRef.current === 0 || autoplayBlocked || videoRef.current?.ended || playhead >= previousEnd - 0.2) {
        seekRef.current = 0;
        switchScene(count - 1);
        setPlayhead(sceneStartMs(scenes, count - 1) / 1000);
      }
    }
    knownScenesRef.current = count;
  }, [snapshot?.scenes, followLive, playhead, autoplayBlocked, switchScene]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!playing) {
      video.pause();
      setAutoplayBlocked(false);
    } else if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      tryPlay(video);
    }
  }, [playing, selectedScene, tryPlay]);

  const scenes = snapshot?.scenes || [];
  const activeScene = scenes[selectedScene];
  const activeCutMs = activeScene?.cut_ms;
  const totalDuration = storyDurationMs(scenes) / 1000;
  const activeStart = sceneStartMs(scenes, selectedScene) / 1000;
  const sceneCount = scenes.length;
  const currentRoundVotes = snapshot?.ideas.reduce((sum, idea) => sum + idea.votes, 0) || 0;
  const liveStatus = !snapshot?.running ? "Story paused" : snapshot.producerActive ? "Live story" : "Waiting for host";
  const canSendComment = Boolean(snapshot?.running && snapshot.producerActive);

  // A clip can reach its cut before the next Hedra job finishes. Resume the
  // continuous movie when that scene arrives, even after a viewer has sought
  // away from the live edge.
  useEffect(() => {
    if (!playing || !waitingForNextScene || selectedScene + 1 >= sceneCount) return;
    seekRef.current = 0;
    switchScene(selectedScene + 1);
  }, [playing, waitingForNextScene, selectedScene, sceneCount, switchScene]);

  // Follow the selected handoff on a displayed video frame, not only the coarse timeupdate event.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || activeCutMs == null || !playing || !video.requestVideoFrameCallback) return;
    const cut = sceneDurationMs({ cut_ms: activeCutMs }) / 1000;
    let stopped = false;
    let callbackId = 0;
    const check: VideoFrameRequestCallback = (_now, frame) => {
      if (stopped) return;
      if (frame.mediaTime >= cut - 0.025) {
        video.pause();
        captureBridgeFrame();
        setPlayhead(activeStart + cut);
        if (selectedScene + 1 < sceneCount) {
          seekRef.current = 0;
          switchScene(selectedScene + 1);
        } else setWaitingForNextScene(true);
        return;
      }
      callbackId = video.requestVideoFrameCallback(check);
    };
    callbackId = video.requestVideoFrameCallback(check);
    return () => { stopped = true; video.cancelVideoFrameCallback(callbackId); };
  }, [activeCutMs, activeStart, playing, selectedScene, sceneCount, captureBridgeFrame, switchScene]);

  function seekTo(value: number) {
    if (!scenes.length) return;
    const time = Math.min(Math.max(0, value), Math.max(0, totalDuration - 0.05));
    const { index, offsetMs } = locateSceneAtMs(scenes, Math.round(time * 1000));
    const offset = offsetMs / 1000;
    setFollowLive(false);
    setWaitingForNextScene(false);
    setPlayhead(time);
    seekRef.current = offset;
    if (index === selectedScene && videoRef.current?.readyState) videoRef.current.currentTime = offset;
    else switchScene(index);
  }

  function goLive() {
    if (!scenes.length) return;
    setFollowLive(true);
    setWaitingForNextScene(false);
    setPlaying(true);
    seekRef.current = 0;
    if (selectedScene !== scenes.length - 1) switchScene(scenes.length - 1);
    setPlayhead(sceneStartMs(scenes, scenes.length - 1) / 1000);
    if (selectedScene === scenes.length - 1 && videoRef.current) videoRef.current.currentTime = 0;
  }

  function togglePlayback() {
    if (playing && !autoplayBlocked) {
      videoRef.current?.pause();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    if (videoRef.current) tryPlay(videoRef.current);
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

  async function resetStory() {
    if (!window.confirm("Delete all scenes and comments from this story? This cannot be undone.")) return;
    setControlBusy(true);
    try {
      const response = await fetch("/api/live/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset" }) });
      const result = await response.json() as { error?: string; mediaCleanupIncomplete?: boolean };
      if (!response.ok) throw new Error(result.error || "Could not reset the story.");
      setSelectedScene(0);
      setWaitingForNextScene(false);
      setBridgeFrame(null);
      setVideoReady(false);
      bridgeFrameCapturedRef.current = false;
      setPlayhead(0);
      setFollowLive(true);
      seekRef.current = 0;
      knownScenesRef.current = 0;
      await load();
      setCommentFeedback(result.mediaCleanupIncomplete ? "The story was reset, but some old video files could not be removed." : null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reset the story.");
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
      const result = await response.json() as { error?: string; usable?: boolean; id?: number };
      if (!response.ok) throw new Error(result.error || "Your suggestion could not be sent.");
      stickToBottomRef.current = true;
      setLastSentId(result.id ?? null);
      setCommentFeedback(result.usable ? "Your suggestion is in chat and counted toward the next scene." : "Your comment is in chat, but Jev did not count it as a story direction.");
      await load();
    } catch (caught) {
      setDraft(body);
      setCommentFeedback(caught instanceof Error ? caught.message : "Your suggestion could not be sent.");
    } finally { setSending(false); }
  }

  return <main className="min-h-screen bg-[#0e0e10] text-[#efeff1]">
    <header className="flex items-center gap-3 border-b border-white/10 bg-[#121214] px-4 py-3">
      <span className="grid size-9 place-items-center rounded-md bg-[#9147ff]"><Clapperboard size={19} /></span>
      <div className="min-w-0"><strong className="text-sm">CrowdCut</strong></div>
      <span className="ml-auto flex items-center gap-2 text-xs text-white/60"><Radio size={14} className="text-[#e91916]" />{liveStatus}</span>
      {snapshot?.isOwner && <button type="button" disabled={controlBusy} onClick={() => void control(snapshot.running ? "stop" : "start")} className="rounded border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-50">{snapshot.running ? "Stop generation" : "Start generation"}</button>}
      {snapshot?.isOwner && !snapshot.running && <button type="button" disabled={controlBusy} onClick={() => void resetStory()} className="rounded border border-white/15 px-3 py-2 text-sm text-white/55 hover:border-rose-400/40 hover:text-rose-200 disabled:opacity-50">Reset story</button>}
    </header>
    {(error || snapshot?.error) && <div role="alert" className="border-b border-rose-400/25 bg-rose-400/10 px-5 py-3 text-sm text-rose-100">{error || snapshot?.error}</div>}
    <div className="mx-auto grid max-w-[1700px] lg:grid-cols-[minmax(0,1fr)_370px]">
      <section className="min-w-0 p-4 sm:p-6"><div className="mx-auto max-w-[1120px]">
        <div className="mb-4"><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{STORY_TITLE}</h1><p className="mt-2 text-sm text-white/55">The audience chooses Sophie&apos;s next move. Watch live or catch up from the beginning.</p></div>
        <div className="relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-black shadow-2xl">
          {(!activeScene || (!videoReady && !bridgeFrame)) && <Image src={OPENING_FRAME_PATH} alt="Sophie opens the door of a moving castle." fill priority className="object-cover" sizes="(max-width: 1024px) 100vw, 70vw" />}
          {activeScene && <video
            ref={videoRef}
            src={mediaUrl(activeScene.number)}
            playsInline
            preload="auto"
            className={`absolute inset-0 size-full object-cover ${videoReady ? "opacity-100" : "opacity-0"}`}
            onLoadedMetadata={(event) => {
              if (seekRef.current !== null) { event.currentTarget.currentTime = seekRef.current; seekRef.current = null; }
            }}
            onLoadedData={() => { setVideoReady(true); setBridgeFrame(null); }}
            onCanPlay={(event) => { if (playing) tryPlay(event.currentTarget); }}
            onPlaying={() => { setAutoplayBlocked(false); setVideoReady(true); setBridgeFrame(null); bridgeFrameCapturedRef.current = false; }}
            onTimeUpdate={(event) => {
              const cut = sceneDurationMs(activeScene) / 1000;
              const position = Math.min(event.currentTarget.currentTime, cut);
              setPlayhead(sceneStartMs(scenes, selectedScene) / 1000 + position);
              if (playing && position >= cut - 0.025) {
                event.currentTarget.pause();
                captureBridgeFrame();
                if (selectedScene + 1 < scenes.length) { seekRef.current = 0; switchScene(selectedScene + 1); }
                else setWaitingForNextScene(true);
              }
            }}
            onEnded={() => {
              captureBridgeFrame();
              if (selectedScene + 1 < scenes.length && playing) { seekRef.current = 0; switchScene(selectedScene + 1); }
              else {
                if (playing) setWaitingForNextScene(true);
                if (followLive) setPlayhead(totalDuration);
              }
            }}
          />}
          {bridgeFrame && <div aria-hidden="true" className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${bridgeFrame})` }} />}
          {activeScene && autoplayBlocked && <button type="button" onClick={togglePlayback} className="absolute inset-0 z-10 flex items-center justify-center bg-black/45 text-lg font-semibold text-white"><span className="flex items-center gap-3 rounded-lg bg-[#9147ff] px-5 py-3 shadow-xl"><Play size={22} fill="currentColor" /> Play with sound</span></button>}
          <span className="absolute left-4 top-4 rounded bg-[#e91916] px-2 py-1 text-[11px] font-bold tracking-wider">{liveStatus.toUpperCase()}</span>
          {!activeScene && <div className="absolute bottom-5 left-5 rounded bg-black/65 px-3 py-2 text-sm">{!snapshot?.running ? "Waiting for the story to begin" : snapshot.producerActive ? "The first scene is taking shape…" : "Waiting for the host to reconnect…"}</div>}
        </div>
        <div className="mt-3 rounded border border-white/10 bg-[#18181b] p-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={togglePlayback} disabled={!activeScene} aria-label={playing && !autoplayBlocked ? "Pause your playback" : "Play with sound"} className="rounded bg-white/10 p-2 disabled:opacity-40">{playing && !autoplayBlocked ? <Pause size={17} /> : <Play size={17} />}</button>
            <span className="shrink-0 text-xs tabular-nums text-white/65">{formatTime(playhead)} / {formatTime(totalDuration)}</span>
            <input type="range" aria-label="Story timeline" min={0} max={Math.max(totalDuration, 0.1)} step={0.1} value={Math.min(playhead, Math.max(totalDuration, 0.1))} onChange={(event) => seekTo(Number(event.target.value))} disabled={!activeScene} className="min-w-0 flex-1 accent-[#9147ff]" />
            <button type="button" onClick={goLive} disabled={!activeScene} className="flex shrink-0 items-center gap-1 rounded bg-[#9147ff]/20 px-2 py-1.5 text-xs font-semibold text-[#bf94ff] disabled:opacity-40"><SkipForward size={14} /> Go live</button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div><p className="text-white/80">{activeScene ? `Scene ${activeScene.number}: ${activeScene.action}` : "Opening scene"}</p>{snapshot?.pendingAction && <p className="text-[#bf94ff]">Audience chose next: {snapshot.pendingAction}</p>}</div>
            <span className="text-xs text-white/45">H3 Max Turbo · 480p · 8s · {scenes.length} scene{scenes.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div className="mb-3 mt-7"><h2 className="text-lg font-semibold">Audience directions</h2><p className="text-sm text-white/45">Jev has reviewed {snapshot?.classifiedCount ?? 0} comments this round. Viewer directions take priority in the next scene.</p></div>
        {snapshot?.ideas.length ? <div className="grid gap-3 sm:grid-cols-2">{snapshot.ideas.map((idea, index) => <div key={idea.id} className="rounded-lg border border-white/10 bg-[#18181b] p-4"><div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded" style={{ background: accents[index] + "22", color: accents[index] }}>{index + 1}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{idea.action}</p><div className="mt-3 h-1 rounded bg-white/10"><div className="h-1 rounded" style={{ width: Math.round(idea.votes / currentRoundVotes * 100) + "%", background: accents[index] }} /></div></div><span className="text-sm font-bold" style={{ color: accents[index] }}>{idea.votes}</span></div></div>)}</div> : <div className="rounded-lg border border-dashed border-white/15 bg-[#18181b] p-6 text-center text-sm text-white/45">The next audience directions are taking shape.</div>}
        {snapshot?.isOwner && <label className="mt-4 flex items-center gap-2 text-xs text-white/50"><input type="checkbox" checked={testChatEnabled} onChange={(event) => setTestChatEnabled(event.target.checked)} className="accent-[#9147ff]" /> Add demo chat</label>}
      </div></section>
      <aside className="flex min-h-[520px] flex-col border-t border-white/10 bg-[#18181b] lg:h-[calc(100vh-64px)] lg:border-l lg:border-t-0">
        <div className="border-b border-white/10 px-4 py-3"><h2 className="text-sm font-semibold">Live chat</h2><p className="mt-0.5 text-xs text-white/40">{snapshot?.commentName ? `You’re ${snapshot.commentName}. Your suggestions join the live story.` : "Your suggestions join the same story everyone is watching."}</p></div>
        <div ref={chatRef} onScroll={(event) => { const chat = event.currentTarget; stickToBottomRef.current = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 100; }} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">{snapshot?.comments.length ? snapshot.comments.map((comment) => <div key={comment.id} className={`text-sm leading-snug ${comment.id === lastSentId ? "rounded border border-[#9147ff]/50 bg-[#9147ff]/10 p-2" : ""}`}><span className={`mr-2 font-semibold ${comment.audience ? "text-[#39e6c5]" : "text-[#bf94ff]"}`}>{comment.name}</span><span className="text-white/75">{comment.body}</span><p className="mt-1 text-[11px] text-white/35">{comment.action ? `Jev → ${comment.action}` : "Chat only · not a story vote"}</p></div>) : <p className="pt-8 text-center text-sm text-white/35">The audience is arriving…</p>}</div>
        {snapshot?.canComment ? <div className="border-t border-white/10 bg-[#18181b]"><form onSubmit={submitComment} className="flex gap-2 p-3"><input value={draft} onChange={(event) => { setDraft(event.target.value); setCommentFeedback(null); }} maxLength={500} placeholder={snapshot.running && !snapshot.producerActive ? "Waiting for the host to reconnect…" : "Suggest what Sophie does next…"} disabled={!canSendComment || sending} className="min-w-0 flex-1 rounded border border-white/10 bg-[#0e0e10] px-3 py-2 text-sm outline-none focus:border-[#9147ff] disabled:opacity-50" /><button type="submit" disabled={!draft.trim() || !canSendComment || sending} className="rounded bg-[#9147ff] px-3 disabled:opacity-40" aria-label="Send suggestion"><ArrowUp size={17} /></button></form>{commentFeedback && <p role="status" className="px-3 pb-3 text-xs text-[#bf94ff]">{commentFeedback}</p>}</div> : <a href="/signin-with-chatgpt?return_to=%2F" target="_top" className="border-t border-white/10 p-4 text-center text-sm text-[#bf94ff]">Sign in to comment</a>}
      </aside>
    </div>
  </main>;
}
