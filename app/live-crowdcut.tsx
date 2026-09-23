"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUp, Clapperboard, LoaderCircle, Pause, Play, Sparkles } from "lucide-react";
import { makeLiveComment, makeLiveName } from "@/lib/demo-comments";
import { captureLastSceneFrame } from "@/lib/scene-frame";
import { OPENING_FRAME_PATH, STORY_TITLE } from "@/lib/story";

type Idea = { id: string; action: string; votes: number };
type Comment = { id: number; name: string; body: string; action?: string | null; state: "pending" | "jev" | "error" };
type Status = { jev: boolean; hedra: boolean; hedraBalance: number | null; hedraStatus: string };
type Classification = { usable: boolean; action?: string | null; clusterId?: string | null; mode?: string; error?: string };
type HedraJob = { status: string; outputs?: Array<{ url?: string }>; error?: string | { message?: string } };
type SubmitResult = { job_id?: string; error?: string };
type Generation =
  | { state: "idle" }
  | { state: "submitting"; action: string }
  | { state: "rendering"; jobId: string; action: string };

const COMMENTS_PER_SCENE = 12;
const MAX_SIMULATED_COMMENTS_PER_SCENE = 25;
const MAX_CLASSIFICATIONS_IN_FLIGHT = 8;
const JEV_IDEA_CANDIDATES = 8;
const TAB_LEASE_KEY = "crowdcut-live-tab";
const accents = ["#a970ff", "#39e6c5", "#ff7d9e", "#6fb8ff"];

export function LiveCrowdCut() {
  const [status, setStatus] = useState<Status | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [running, setRunning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [roundProcessed, setRoundProcessed] = useState(0);
  const [roundIndex, setRoundIndex] = useState(0);
  const [sceneCount, setSceneCount] = useState(0);
  const [videoJobId, setVideoJobId] = useState<string | null>(null);
  const [playingAction, setPlayingAction] = useState<string | null>(null);
  const [frameReady, setFrameReady] = useState(true);
  const [generation, setGeneration] = useState<Generation>({ state: "idle" });
  const [draft, setDraft] = useState("");

  const ideasRef = useRef<Idea[]>([]);
  const historyRef = useRef<string[]>([]);
  const roundRef = useRef(0);
  const commentIndexRef = useRef(0);
  const simulatedThisRoundRef = useRef(0);
  const nextCommentId = useRef(1);
  const inFlightRef = useRef(0);
  const failuresRef = useRef(0);
  const submittingRef = useRef(false);
  const tabIdRef = useRef("");
  const frameRef = useRef<Blob | null>(null);
  const chatListRef = useRef<HTMLDivElement | null>(null);

  const claimTab = useCallback(() => {
    if (!tabIdRef.current) tabIdRef.current = crypto.randomUUID();
    try {
      const current = JSON.parse(localStorage.getItem(TAB_LEASE_KEY) || "null") as { id?: string; expires?: number } | null;
      if (current?.id !== tabIdRef.current && (current?.expires || 0) > Date.now()) return false;
      localStorage.setItem(TAB_LEASE_KEY, JSON.stringify({ id: tabIdRef.current, expires: Date.now() + 8000 }));
      return true;
    } catch {
      return true;
    }
  }, []);

  useEffect(() => {
    const claimTimer = window.setTimeout(() => {
      if (running && !claimTab()) {
        setRunning(false);
        setError("Another CrowdCut tab is already running the story. Pause it before resuming here.");
      }
    }, 0);
    const heartbeat = window.setInterval(() => {
      if (!running) return;
      if (!claimTab()) {
        setRunning(false);
        setError("Another CrowdCut tab has taken over the live story.");
      }
    }, 3000);
    return () => {
      window.clearTimeout(claimTimer);
      window.clearInterval(heartbeat);
      try {
        const current = JSON.parse(localStorage.getItem(TAB_LEASE_KEY) || "null") as { id?: string } | null;
        if (current?.id === tabIdRef.current) localStorage.removeItem(TAB_LEASE_KEY);
      } catch { /* Storage is optional. */ }
    };
  }, [claimTab, running]);

  useEffect(() => {
    fetch("/api/status", { cache: "no-store", redirect: "manual" })
      .then(async (response) => {
        if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) {
          setAuthRequired(true);
          return;
        }
        const next = await response.json() as Status;
        setStatus(next);
        if (!next.jev) { setError("Jev is unavailable. The story will wait for classification."); setRunning(false); }
        else if (!next.hedra) { setError("Hedra is unavailable. The story will wait until its connection is restored."); setRunning(false); }
      }).catch(() => { setError("The live connections could not be checked."); setRunning(false); });
  }, []);

  const classify = useCallback(async (body: string, name: string) => {
    const id = nextCommentId.current++;
    const round = roundRef.current;
    inFlightRef.current++;
    setComments((current) => [...current.slice(-79), { id, name, body, state: "pending" }]);
    try {
      const sceneContext = historyRef.current.length
        ? "Recent audience choices: " + historyRef.current.slice(-2).map((action, index) => (index + 1) + ". " + action).join("; ")
        : "";
      const response = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment: body,
          sceneContext,
          existingIdeas: [...ideasRef.current]
            .sort((a, b) => b.votes - a.votes)
            .slice(0, JEV_IDEA_CANDIDATES)
            .map((idea) => ({ id: idea.id, action: idea.action })),
        }),
      });
      const result = await response.json() as Classification;
      if (!response.ok) throw new Error(result.error || "Jev could not classify this comment.");
      if (result.mode !== "jev") throw new Error("Jev is not responding; the live story has paused.");
      failuresRef.current = 0;
      const action = result.usable && typeof result.action === "string" ? result.action : null;
      const ideaId = result.usable && typeof result.clusterId === "string" ? result.clusterId : null;
      setComments((current) => current.map((item) => item.id === id ? { ...item, action, state: "jev" } : item));
      if (round !== roundRef.current) return;
      setRoundProcessed((value) => value + 1);
      if (action && ideaId) {
        const current = ideasRef.current;
        const updated = current.some((idea) => idea.id === ideaId)
          ? current.map((idea) => idea.id === ideaId ? { ...idea, votes: idea.votes + 1 } : idea)
          : [...current, { id: ideaId, action, votes: 1 }];
        ideasRef.current = updated;
        setIdeas(updated);
      }
    } catch (caught) {
      setComments((current) => current.map((item) => item.id === id ? { ...item, action: "Could not classify", state: "error" } : item));
      failuresRef.current++;
      if (failuresRef.current >= 3) {
        setError(caught instanceof Error ? caught.message : "Jev classification failed.");
        setRunning(false);
      }
    } finally {
      inFlightRef.current--;
    }
  }, []);

  useEffect(() => {
    if (!running || !status?.jev) return;
    let timer: number | undefined;
    const sendNext = () => {
      if (roundRef.current !== roundIndex || simulatedThisRoundRef.current >= MAX_SIMULATED_COMMENTS_PER_SCENE) return;
      if (inFlightRef.current < MAX_CLASSIFICATIONS_IN_FLIGHT) {
        const index = commentIndexRef.current++;
        simulatedThisRoundRef.current++;
        void classify(makeLiveComment(index), makeLiveName(index, roundIndex));
      }
      // Most messages take a beat to type; an occasional longer pause keeps chat human-paced.
      const typingDelay = 400 + Math.random() * 750 + (Math.random() < 0.12 ? 500 + Math.random() * 550 : 0);
      timer = window.setTimeout(sendNext, typingDelay);
    };
    timer = window.setTimeout(sendNext, 450 + Math.random() * 400);
    return () => { if (timer) window.clearTimeout(timer); };
  }, [running, status?.jev, classify, roundIndex]);

  const results = useMemo(() => [...ideas].sort((a, b) => b.votes - a.votes).slice(0, 4), [ideas]);
  const totalVotes = ideas.reduce((sum, idea) => sum + idea.votes, 0);
  const leader = results[0];

  const submitScene = useCallback(async (action: string) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    // The current decision is locked; start collecting the following scene's chat now.
    roundRef.current++;
    simulatedThisRoundRef.current = 0;
    ideasRef.current = [];
    setIdeas([]);
    setRoundProcessed(0);
    setRoundIndex(roundRef.current);
    setGeneration({ state: "submitting", action });
    try {
      let frame = frameRef.current;
      if (!frame) {
        const opening = await fetch(OPENING_FRAME_PATH);
        if (!opening.ok) throw new Error("The opening frame could not be loaded.");
        frame = await opening.blob();
      }
      const form = new FormData();
      form.append("action", action);
      form.append("preset", "fastest");
      form.append("openingFrame", frame, "scene-start.png");
      form.append("sceneContext", historyRef.current.slice(-6).map((choice, index) => "Recent scene " + (index + 1) + ": " + choice).join("; "));
      const response = await fetch("/api/hedra/generate", { method: "POST", body: form });
      const job = await response.json() as SubmitResult;
      if (!response.ok) throw new Error(job.error || "Hedra could not start the next scene.");
      if (!job.job_id) throw new Error("Hedra returned no job ID.");
      historyRef.current = [...historyRef.current, action];
      setGeneration({ state: "rendering", jobId: job.job_id, action });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The next scene could not be started.");
      setRunning(false);
      setGeneration({ state: "idle" });
    } finally {
      submittingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!running || !status?.jev || !status.hedra || !frameReady || generation.state !== "idle" || !leader || roundProcessed < COMMENTS_PER_SCENE) return;
    const timer = window.setTimeout(() => void submitScene(leader.action), 0);
    return () => window.clearTimeout(timer);
  }, [running, status, frameReady, generation.state, leader, roundProcessed, submitScene]);

  useEffect(() => {
    if (generation.state !== "rendering") return;
    const jobId = generation.jobId;
    let cancelled = false;
    let finished = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const response = await fetch("/api/hedra/jobs/" + encodeURIComponent(jobId), { cache: "no-store" });
        const job = await response.json() as HedraJob;
        if (!response.ok || job.status === "FAILED") {
          throw new Error((typeof job.error === "string" ? job.error : job.error?.message) || "Hedra could not finish this scene.");
        }
        if (cancelled) return;
        if (job.status === "COMPLETED") {
          finished = true;
          setFrameReady(false);
          setVideoJobId(jobId);
          setPlayingAction(generation.action);
          setSceneCount((value) => value + 1);
          try {
            frameRef.current = await captureLastSceneFrame(jobId);
            if (cancelled) return;
            setFrameReady(true);
            setGeneration({ state: "idle" });
          } catch (caught) {
            if (cancelled) return;
            setError(caught instanceof Error ? caught.message : "Could not prepare the next scene frame.");
            setRunning(false);
            setGeneration({ state: "idle" });
          }
          return;
        }
      } catch (caught) {
        if (cancelled) return;
        finished = true;
        setError(caught instanceof Error ? caught.message : "The scene could not be checked.");
        setRunning(false);
        setGeneration({ state: "idle" });
        return;
      }
      if (!cancelled && !finished) timer = window.setTimeout(poll, 1000);
    };
    void poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [generation]);

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    void classify(body, "you");
    window.requestAnimationFrame(() => chatListRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function toggleStory() {
    if (running) { setRunning(false); return; }
    if (!frameReady) {
      frameRef.current = null;
      historyRef.current = [];
      roundRef.current++;
      simulatedThisRoundRef.current = 0;
      ideasRef.current = [];
      setIdeas([]);
      setRoundProcessed(0);
      setRoundIndex(roundRef.current);
      setVideoJobId(null);
      setPlayingAction(null);
      setSceneCount(0);
      setFrameReady(true);
    }
    if (!claimTab()) {
      setError("Another CrowdCut tab is already running the story. Pause it before resuming here.");
      return;
    }
    failuresRef.current = 0;
    setError(null);
    setRunning(true);
  }

  const isRendering = generation.state === "submitting" || generation.state === "rendering" || !frameReady;

  return (
    <main className="min-h-screen bg-[#0e0e10] text-[#efeff1]">
      <header className="flex items-center gap-3 border-b border-white/10 bg-[#121214] px-4 py-3">
        <span className="grid size-9 place-items-center rounded-md bg-[#9147ff]"><Clapperboard size={19} /></span>
        <div className="min-w-0"><strong className="text-sm">CrowdCut</strong><span className="ml-2 text-sm text-white/55">/ {STORY_TITLE}</span></div>
        <button type="button" onClick={toggleStory} className="ml-auto flex shrink-0 items-center gap-2 rounded border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium hover:bg-white/10">
          {running ? <Pause size={15} /> : <Play size={15} />}{running ? "Pause story" : !frameReady ? "Restart story" : "Resume story"}
        </button>
      </header>
      {authRequired && <div className="border-b border-amber-400/25 bg-amber-400/10 px-5 py-3 text-sm text-amber-100">Sign in to run the live story. <a className="underline" href="/signin-with-chatgpt?return_to=%2F">Continue with ChatGPT</a>.</div>}
      {error && <div role="alert" className="border-b border-rose-400/25 bg-rose-400/10 px-5 py-3 text-sm text-rose-100">{error}</div>}
      <div className="mx-auto grid max-w-[1700px] lg:grid-cols-[minmax(0,1fr)_370px]">
        <section className="min-w-0 p-4 sm:p-6"><div className="mx-auto max-w-[1120px]">
          <div className="mb-4"><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{STORY_TITLE}</h1><p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/55">{sceneCount ? "The audience is choosing Sophie's next move as the story unfolds." : "Sophie followed her long-lost friend's shadows to a moving castle. The audience decides what happens next."}</p></div>
          <div className="relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-black shadow-2xl">
            {videoJobId ? <video key={videoJobId} src={"/api/hedra/media/" + encodeURIComponent(videoJobId)} controls autoPlay loop muted playsInline className="absolute inset-0 size-full object-cover" /> : <Image src={OPENING_FRAME_PATH} alt="Sophie opens the ornate door of a moving castle." fill priority className="object-cover" sizes="(max-width: 1024px) 100vw, 70vw" />}
            {!videoJobId && <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20" />}
            <div className="absolute left-4 top-4 rounded bg-[#e91916] px-2 py-1 text-[11px] font-bold tracking-wider">LIVE STORY</div>
            {isRendering && <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded bg-black/75 px-3 py-2 text-sm text-white"><LoaderCircle size={16} className="animate-spin" />{generation.state === "submitting" ? "Starting scene " + (sceneCount + 1) : frameReady ? "Rendering scene " + (sceneCount + 1) : "Preparing the next frame"}</div>}
            {!videoJobId && !isRendering && <div className="absolute bottom-5 left-5 max-w-xl"><p className="text-xs font-bold uppercase tracking-widest text-[#39e6c5]">The story begins</p><p className="mt-1 text-xl font-semibold sm:text-2xl">A familiar shadow vanishes inside.</p></div>}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-white/10 bg-[#18181b] px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm text-white/75">{isRendering ? "The next scene is underway." : running ? "Jev is shaping the next scene from live chat." : "The story is paused."}</p>
              {playingAction && <p className="mt-1 text-sm text-white/55"><span className="font-medium text-white/75">Now playing:</span> {playingAction}</p>}
              {generation.state !== "idle" && <p className="mt-1 text-sm text-[#bf94ff]"><span className="font-medium">Audience chose next:</span> {generation.action}</p>}
            </div>
            <p className="text-xs text-white/45">H3 Max Turbo · 480p · 8s <span className="mx-2 text-white/20">·</span> {sceneCount} scene{sceneCount === 1 ? "" : "s"} played</p>
          </div>
          <div className="mb-3 mt-7"><h2 className="text-lg font-semibold">Audience directions</h2><p className="text-sm text-white/45">Jev groups the current wave of comments. A new action can become the next scene.</p></div>
          {results.length ? <div className="grid gap-3 sm:grid-cols-2">{results.map((idea, index) => <div key={idea.id} className="rounded-lg border border-white/10 bg-[#18181b] p-4"><div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded" style={{ background: accents[index] + "22", color: accents[index] }}>{index + 1}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{idea.action}</p><div className="mt-3 h-1 rounded bg-white/10"><div className="h-1 rounded" style={{ width: Math.round(idea.votes / totalVotes * 100) + "%", background: accents[index] }} /></div></div><span className="text-sm font-bold" style={{ color: accents[index] }}>{idea.votes}</span></div></div>)}</div>
            : <div className="rounded-lg border border-dashed border-white/15 bg-[#18181b] p-6 text-center text-sm text-white/45">The next audience directions are taking shape.</div>}
        </div></section>
        <aside className="flex min-h-[520px] flex-col border-t border-white/10 bg-[#18181b] lg:h-[calc(100vh-64px)] lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><h2 className="text-sm font-semibold">Live chat</h2><p className="mt-0.5 text-xs text-white/40">Chat suggestions · Jev reads each one</p></div><span className="flex items-center gap-1.5 text-xs text-[#39e6c5]"><Sparkles size={13} />{Math.min(roundProcessed, COMMENTS_PER_SCENE)}/{COMMENTS_PER_SCENE}</span></div>
          <div ref={chatListRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">{comments.length ? comments.slice().reverse().map((comment) => <div key={comment.id} className={"text-sm leading-snug " + (comment.name === "you" ? "rounded border border-[#39e6c5]/30 bg-[#39e6c5]/10 p-2" : "")}><span className={"mr-2 font-semibold " + (comment.name === "you" ? "text-[#39e6c5]" : "text-[#bf94ff]")}>{comment.name}</span><span className="text-white/75">{comment.body}</span><p className={"mt-1 text-[11px] " + (comment.state === "error" ? "text-[#ff8ca5]" : "text-white/35")}>{comment.state === "pending" ? "Reading…" : comment.state === "error" ? comment.action : comment.action ? "Jev → " + comment.action : "Jev → off-topic"}</p></div>) : <p className="pt-8 text-center text-sm text-white/35">The audience is arriving…</p>}</div>
          <form onSubmit={submitComment} className="flex gap-2 border-t border-white/10 bg-[#18181b] p-3"><input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500} placeholder="Suggest what Sophie does next…" className="min-w-0 flex-1 rounded border border-white/10 bg-[#0e0e10] px-3 py-2 text-sm outline-none focus:border-[#9147ff]" /><button type="submit" disabled={!draft.trim()} className="rounded bg-[#9147ff] px-3 disabled:opacity-40" aria-label="Send suggestion"><ArrowUp size={17} /></button></form>
        </aside>
      </div>
    </main>
  );
}
