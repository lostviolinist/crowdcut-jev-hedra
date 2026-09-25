"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUp, Clapperboard, Pause, Play, Radio, SkipForward, Sparkles } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { makeLiveComment, makeLiveName } from "@/lib/demo-comments";
import { MAX_COMMENTS_TO_CHOOSE, MIN_COMMENTS_TO_CHOOSE } from "@/lib/live-decision";
import { captureSceneHandoffFromUrl } from "@/lib/scene-frame";
import { OPENING_FRAME_PATH, STORY_TITLE } from "@/lib/story";
import { locateSceneAtMs, sceneDurationMs, sceneStartMs, storyDurationMs } from "@/lib/story-timeline";

type Scene = { number: number; action: string; cut_ms: number; created_at: number };
type ChatComment = { id: number; name: string; body: string; action: string | null; round: number; created_at: number; audience: number };
type Idea = { id: string; action: string; votes: number; audienceVotes: number };
type Snapshot = {
  running: boolean; producerActive: boolean; externalProducer: boolean; phase: string; round: number; sceneCount: number; generation: number; pendingAction: string | null;
  nextAction: string | null;
  error: string | null; scenes: Scene[]; comments: ChatComment[]; ideas: Idea[]; classifiedCount: number; chatOnlyCount: number;
  isOwner: boolean; canComment: boolean; commentName: string | null;
};

const MAX_TEST_COMMENTS_PER_ROUND = 500;
const MAX_TEST_COMMENTS_IN_FLIGHT = 24;
const accents = ["#a970ff", "#39e6c5", "#ff7d9e", "#6fb8ff", "#ffbd69", "#b4a8ff"];

function JevDecisionPanel({ snapshot, testChatEnabled, onTestChatChange }: {
  snapshot: Snapshot | null;
  testChatEnabled: boolean;
  onTestChatChange: (enabled: boolean) => void;
}) {
  const classified = snapshot?.classifiedCount ?? 0;
  const ideas = snapshot?.ideas.slice(0, 3) ?? [];
  const highestVotes = Math.max(1, ...ideas.map((idea) => idea.votes));
  const recent = snapshot?.comments.filter((comment) => comment.round === snapshot.round).slice(-2).reverse() ?? [];

  return <section aria-label="Jev live decisions" className="shrink-0 border-b border-[#9147ff]/25 bg-[#21192e] px-4 py-3">
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-bold text-white"><Sparkles size={16} className="text-[#bf94ff]" /> Jev is reading chat</h2>
      <span className="text-xs font-medium tabular-nums text-[#bf94ff]">{classified} classified</span>
    </div>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#a970ff] transition-[width] duration-500" style={{ width: `${Math.min(classified / MAX_COMMENTS_TO_CHOOSE, 1) * 100}%` }} /></div>
    <p className="mt-1.5 text-xs text-white/55">Chooses after {MIN_COMMENTS_TO_CHOOSE}–{MAX_COMMENTS_TO_CHOOSE} comments · {snapshot?.chatOnlyCount ?? 0} chat-only</p>
    {snapshot?.nextAction && <p className="mt-2 rounded border border-[#a970ff]/30 bg-[#a970ff]/15 px-2 py-1.5 text-xs text-[#e5d4ff]"><span className="font-bold">Jev chose next:</span> {snapshot.nextAction}</p>}
    {!snapshot?.nextAction && snapshot?.pendingAction && <p className="mt-2 rounded border border-[#a970ff]/30 bg-[#a970ff]/15 px-2 py-1.5 text-xs text-[#e5d4ff]"><span className="font-bold">Now rendering:</span> {snapshot.pendingAction}</p>}
    <div className="mt-3 flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-white/50"><span>Leading directions</span><span>Votes</span></div>
    {ideas.length ? <div className="mt-1.5 space-y-1.5">{ideas.map((idea, index) => <div key={idea.id} className="flex items-center gap-2 text-sm"><span className="w-4 shrink-0 text-xs font-bold" style={{ color: accents[index] }}>{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-white/85" title={idea.action}>{idea.action}</p><div className="mt-1 h-0.5 rounded bg-white/10"><div className="h-full rounded" style={{ width: `${idea.votes / highestVotes * 100}%`, backgroundColor: accents[index] }} /></div></div><span className="w-5 shrink-0 text-right font-semibold tabular-nums" style={{ color: accents[index] }}>{idea.votes}</span></div>)}</div> : <p className="mt-1.5 text-xs text-white/45">Reading the first directions…</p>}
    {recent.length > 0 && <div className="mt-3 border-t border-white/10 pt-2"><p className="text-xs font-bold uppercase tracking-[0.12em] text-white/50">Just classified</p>{recent.map((comment) => <p key={comment.id} className="mt-1 truncate text-xs text-white/60" title={comment.body + " → " + (comment.action || "Chat only")}>“{comment.body}” <span className="text-[#bf94ff]">→ {comment.action || "Chat only"}</span></p>)}</div>}
    {snapshot?.isOwner && !snapshot.externalProducer && <label className="mt-3 flex items-center gap-2 border-t border-white/10 pt-2 text-xs text-white/50"><input type="checkbox" checked={testChatEnabled} onChange={(event) => onTestChatChange(event.target.checked)} className="accent-[#9147ff]" /> Add demo chat</label>}
  </section>;
}

function mediaUrl(number: number, generation: number) { return `/api/live/media/${number}?generation=${generation}`; }
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
  const [resetMessage, setResetMessage] = useState<string | null>(null);
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
  const initialSnapshotLoadedRef = useRef(false);
  const frameUploadingRef = useRef(false);
  const commentIndexRef = useRef(0);
  const testCommentsThisRoundRef = useRef(0);
  const testCommentsRoundRef = useRef<number | null>(null);
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
    const timer = window.setInterval(() => void load(), 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);

  useEffect(() => {
    if (!snapshot?.isOwner || snapshot.externalProducer) return;
    const tick = () => void fetch("/api/live/tick", { method: "POST" }).catch(() => {});
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [snapshot?.isOwner, snapshot?.externalProducer]);

  useEffect(() => {
    if (!snapshot?.isOwner || snapshot.externalProducer || snapshot.phase !== "awaiting_frame" || frameUploadingRef.current) return;
    frameUploadingRef.current = true;
    const upload = async () => {
      try {
        const handoff = snapshot.sceneCount === 0
          ? { frame: await fetch(OPENING_FRAME_PATH).then((response) => { if (!response.ok) throw new Error("Opening frame unavailable."); return response.blob(); }), cutMs: 8000 }
          : await captureSceneHandoffFromUrl(mediaUrl(snapshot.sceneCount, snapshot.generation));
        const form = new FormData();
        form.append("sceneNumber", String(snapshot.sceneCount));
        form.append("generation", String(snapshot.generation));
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
  }, [snapshot?.isOwner, snapshot?.externalProducer, snapshot?.phase, snapshot?.sceneCount, snapshot?.generation, frameRetry, load]);

  useEffect(() => {
    if (!snapshot?.isOwner || snapshot.externalProducer || !snapshot.running || !testChatEnabled) return;
    let timer: number | undefined;
    const round = snapshot.round;
    if (testCommentsRoundRef.current !== round) {
      testCommentsRoundRef.current = round;
      testCommentsThisRoundRef.current = 0;
    }
    const sendNext = () => {
      if (testCommentsThisRoundRef.current >= MAX_TEST_COMMENTS_PER_ROUND) return;
      if (testCommentsInFlightRef.current < MAX_TEST_COMMENTS_IN_FLIGHT) {
        const index = testCommentsThisRoundRef.current++;
        const nameIndex = commentIndexRef.current++;
        testCommentsInFlightRef.current++;
        void fetch("/api/live/comments", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: makeLiveComment(index, round), name: makeLiveName(nameIndex, round), synthetic: true }),
        }).catch(() => {}).finally(() => { testCommentsInFlightRef.current--; });
      }
      // The first directions arrive quickly enough for Jev to decide early;
      // chat then continues at a readable, staggered pace through rendering.
      timer = window.setTimeout(sendNext, testCommentsThisRoundRef.current < 24 ? 55 + Math.random() * 90 : 450 + Math.random() * 350);
    };
    timer = window.setTimeout(sendNext, 40 + Math.random() * 90);
    return () => { if (timer) window.clearTimeout(timer); };
  }, [snapshot?.isOwner, snapshot?.externalProducer, snapshot?.running, snapshot?.round, testChatEnabled]);

  const newestCommentId = snapshot?.comments.at(-1)?.id;
  useEffect(() => {
    const chat = chatRef.current;
    if (chat && stickToBottomRef.current) chat.scrollTop = chat.scrollHeight;
  }, [newestCommentId]);

  useEffect(() => {
    if (!snapshot) return;
    const scenes = snapshot?.scenes || [];
    const count = scenes.length;
    // Existing scenes are the movie a late viewer came to watch, not new
    // arrivals to follow. Only future scenes should trigger live-edge logic.
    if (!initialSnapshotLoadedRef.current) {
      initialSnapshotLoadedRef.current = true;
      knownScenesRef.current = count;
      if (count > 0) setFollowLive(false);
      return;
    }
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
  }, [snapshot, followLive, playhead, autoplayBlocked, switchScene]);

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
    setResetMessage(null);
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
    setControlBusy(true);
    setResetMessage("Preparing to reset the story…");
    try {
      const stopped = await fetch("/api/live/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop" }) });
      if (!stopped.ok) throw new Error("Could not stop generation before resetting.");
      const deadline = Date.now() + 5 * 60_000;
      let mediaCleanupIncomplete = false;
      while (true) {
        const response = await fetch("/api/live/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset", resetIntent: "clear-current-story-v2" }) });
        const result = await response.json() as { error?: string; retryable?: boolean; mediaCleanupIncomplete?: boolean };
        if (response.ok) { mediaCleanupIncomplete = Boolean(result.mediaCleanupIncomplete); break; }
        if (response.status !== 409 || !result.retryable || Date.now() >= deadline) throw new Error(result.error || "Could not reset the story.");
        setResetMessage("Clearing the story…");
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
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
      setResetMessage(mediaCleanupIncomplete ? "Story reset, but some old video files could not be removed from storage." : "Story reset. Ready for a fresh start.");
      setError(null);
    } catch (caught) {
      setResetMessage(caught instanceof Error ? caught.message : "Could not reset the story.");
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
      {snapshot && !snapshot.isOwner && <a href="/signin-with-chatgpt?return_to=%2F" className="rounded border border-white/15 px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white">Sign in</a>}
      {snapshot?.isOwner && <button type="button" disabled={controlBusy} onClick={() => void control(snapshot.running ? "stop" : "start")} className="rounded border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-50">{snapshot.running ? "Stop generation" : "Start generation"}</button>}
      {snapshot?.isOwner && <AlertDialog>
        <AlertDialogTrigger asChild><button type="button" disabled={controlBusy} className="rounded border border-rose-500 bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:border-rose-400 hover:bg-rose-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300 disabled:cursor-not-allowed disabled:opacity-50">{controlBusy && resetMessage ? "Resetting…" : "Reset story"}</button></AlertDialogTrigger>
        <AlertDialogContent className="border-white/20 bg-[#1f1f23] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this story and start over?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/70">This permanently deletes {snapshot.scenes.length} scene{snapshot.scenes.length === 1 ? "" : "s"} and all comments. A scene already submitted to Hedra may still incur a charge, but won&apos;t appear in the restarted story.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">Keep story</AlertDialogCancel>
            <AlertDialogAction variant="destructive" className="bg-rose-600 text-white hover:bg-rose-500" onClick={() => void resetStory()}>Delete story and reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </header>
    {resetMessage && <div role="status" className="border-b border-[#9147ff]/25 bg-[#21192e] px-5 py-3 text-sm text-[#e5d4ff]">{resetMessage}</div>}
    {(error || snapshot?.error) && <div role="alert" className="border-b border-rose-400/25 bg-rose-400/10 px-5 py-3 text-sm text-rose-100">{error || snapshot?.error}</div>}
    <div className="mx-auto grid max-w-[1700px] lg:grid-cols-[minmax(0,1fr)_370px]">
      <section className="min-w-0 p-4 sm:p-6"><div className="mx-auto max-w-[1120px]">
        <div className="mb-4"><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{STORY_TITLE}</h1><p className="mt-2 text-sm text-white/55">The audience chooses Sophie&apos;s next move. Watch live or catch up from the beginning.</p></div>
        <div className="mb-3 rounded border border-[#9147ff]/30 bg-[#21192e] px-3 py-2 text-sm text-white/80 lg:hidden"><span className="font-bold text-[#bf94ff]">Jev live</span> · {snapshot?.classifiedCount ?? 0} classified · {snapshot?.ideas[0]?.action || "Reading chat"}</div>
        <div className="relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-black shadow-2xl">
          {(!activeScene || (!videoReady && !bridgeFrame)) && <Image src={OPENING_FRAME_PATH} alt="Sophie opens the door of a moving castle." fill priority className="object-cover" sizes="(max-width: 1024px) 100vw, 70vw" />}
          {activeScene && <video
            ref={videoRef}
            src={mediaUrl(activeScene.number, snapshot?.generation ?? 0)}
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
            <div><p className="text-white/80">{activeScene ? `Scene ${activeScene.number}: ${activeScene.action}` : "Opening scene"}</p>{snapshot?.nextAction ? <p className="text-[#bf94ff]">Jev chose next: {snapshot.nextAction}</p> : snapshot?.pendingAction && <p className="text-[#bf94ff]">Rendering: {snapshot.pendingAction}</p>}</div>
            <span className="text-xs text-white/45">H3 Max Turbo · 480p · 8s · {scenes.length} scene{scenes.length === 1 ? "" : "s"}</span>
          </div>
        </div>
      </div></section>
      <aside className="flex min-h-[520px] flex-col border-t border-white/10 bg-[#18181b] lg:sticky lg:top-0 lg:h-[calc(100vh-64px)] lg:border-l lg:border-t-0">
        <JevDecisionPanel snapshot={snapshot} testChatEnabled={testChatEnabled} onTestChatChange={setTestChatEnabled} />
        <div className="border-b border-white/10 px-4 py-3"><h2 className="text-sm font-semibold">Live chat</h2><p className="mt-0.5 text-xs text-white/40">{snapshot?.commentName ? `You’re ${snapshot.commentName}. Your suggestions join the live story.` : "Your suggestions join the same story everyone is watching."}</p></div>
        <div ref={chatRef} onScroll={(event) => { const chat = event.currentTarget; stickToBottomRef.current = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 100; }} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">{snapshot?.comments.length ? snapshot.comments.map((comment) => <div key={comment.id} className={`text-sm leading-snug ${comment.id === lastSentId ? "rounded border border-[#9147ff]/50 bg-[#9147ff]/10 p-2" : ""}`}><span className={`mr-2 font-semibold ${comment.audience ? "text-[#39e6c5]" : "text-[#bf94ff]"}`}>{comment.name}</span><span className="text-white/75">{comment.body}</span><p className="mt-1 text-[11px] text-white/35">{comment.action ? `Jev → ${comment.action}` : "Chat only · not a story vote"}</p></div>) : <p className="pt-8 text-center text-sm text-white/35">The audience is arriving…</p>}</div>
        {snapshot?.canComment ? <div className="border-t border-white/10 bg-[#18181b]"><form onSubmit={submitComment} className="flex gap-2 p-3"><input value={draft} onChange={(event) => { setDraft(event.target.value); setCommentFeedback(null); }} maxLength={500} placeholder={snapshot.running && !snapshot.producerActive ? "Waiting for the host to reconnect…" : "Suggest what Sophie does next…"} disabled={!canSendComment || sending} className="min-w-0 flex-1 rounded border border-white/10 bg-[#0e0e10] px-3 py-2 text-sm outline-none focus:border-[#9147ff] disabled:opacity-50" /><button type="submit" disabled={!draft.trim() || !canSendComment || sending} className="rounded bg-[#9147ff] px-3 disabled:opacity-40" aria-label="Send suggestion"><ArrowUp size={17} /></button></form>{commentFeedback && <p role="status" className="px-3 pb-3 text-xs text-[#bf94ff]">{commentFeedback}</p>}</div> : <a href="/signin-with-chatgpt?return_to=%2F" target="_top" className="border-t border-white/10 p-4 text-center text-sm text-[#bf94ff]">Sign in to comment</a>}
      </aside>
    </div>
  </main>;
}
