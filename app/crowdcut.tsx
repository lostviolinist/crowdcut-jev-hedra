"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ArrowUp, Clapperboard, LoaderCircle, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { demoComments, demoNames } from "@/lib/demo-comments";
import { OPENING_FRAME_PATH, STORY_TITLE } from "@/lib/story";
import type { StoryRenderPreset } from "@/lib/hedra";

type Idea = { id: string; action: string; votes: number };
type Comment = { id: number; name: string; body: string; action?: string | null; state: "pending" | "jev" | "simulation" | "error" };
type Status = { jev: boolean; hedra: boolean; hedraStatus: string; hedraBalance: number | null };
type ClassifyResult = { usable: boolean; action?: string | null; clusterId?: string | null; mode?: string; error?: string };
type HedraJob = { status: string; error?: string | { message?: string }; outputs?: { url?: string }[] };
type EstimateResult = { cost?: number; error?: string };
type SubmitResult = { job_id?: string; error?: string };
type Generation =
  | { state: "idle" | "estimating" | "submitting" }
  | { state: "quoted"; action: string; cost: number; preset: StoryRenderPreset }
  | { state: "generating"; jobId: string }
  | { state: "complete"; url: string }
  | { state: "error"; message: string };

const accents = ["#a970ff", "#39e6c5", "#ff7d9e", "#6fb8ff"];

export function CrowdCut() {
  const [status, setStatus] = useState<Status | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const ideasRef = useRef<Idea[]>([]);
  const nextId = useRef(1);
  const cursor = useRef(0);
  const inFlight = useRef(0);
  const [stream, setStream] = useState<"idle" | "running" | "paused" | "complete">("idle");
  const [speed, setSpeed] = useState<1 | 3 | 5>(3);
  const [sent, setSent] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [jevProcessed, setJevProcessed] = useState(0);
  const [offTopic, setOffTopic] = useState(0);
  const [failed, setFailed] = useState(0);
  const [latencyTotal, setLatencyTotal] = useState(0);
  const [draft, setDraft] = useState("");
  const [preset, setPreset] = useState<StoryRenderPreset>("fast");
  const [generation, setGeneration] = useState<Generation>({ state: "idle" });

  useEffect(() => {
    fetch("/api/status", { cache: "no-store", redirect: "manual" })
      .then(async (response) => {
        if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) {
          setAuthRequired(true);
          return;
        }
        setStatus(await response.json() as Status);
      }).catch(() => undefined);
  }, []);
  useEffect(() => { ideasRef.current = ideas; }, [ideas]);

  const classify = useCallback(async (body: string, name: string, fromStream: boolean) => {
    const id = nextId.current++;
    const start = performance.now();
    setComments((current) => [...current.slice(-79), { id, name, body, state: "pending" }]);
    if (fromStream) inFlight.current++;
    try {
      const response = await fetch("/api/classify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: body, existingIdeas: ideasRef.current.slice(0, 16).map((idea) => ({ id: idea.id, action: idea.action })) }),
      });
      const result = await response.json() as ClassifyResult;
      if (!response.ok) throw new Error(result.error || "Classification failed.");
      const action = result.usable && typeof result.action === "string" ? result.action : null;
      const ideaId = result.usable && typeof result.clusterId === "string" ? result.clusterId : null;
      const source = result.mode === "jev" ? "jev" : "simulation";
      setComments((current) => current.map((comment) => comment.id === id ? { ...comment, action, state: source } : comment));
      if (action && ideaId) {
        const current = ideasRef.current;
        const updated = current.some((idea) => idea.id === ideaId)
          ? current.map((idea) => idea.id === ideaId ? { ...idea, votes: idea.votes + 1 } : idea)
          : [...current, { id: ideaId, action, votes: 1 }];
        ideasRef.current = updated;
        setIdeas(updated);
      }
      if (fromStream) {
        setProcessed((value) => value + 1);
        if (source === "jev") setJevProcessed((value) => value + 1);
        if (!action) setOffTopic((value) => value + 1);
        setLatencyTotal((value) => value + performance.now() - start);
      }
    } catch (error) {
      setComments((current) => current.map((comment) => comment.id === id ? { ...comment, state: "error", action: error instanceof Error ? error.message : "Request failed" } : comment));
      if (fromStream) setFailed((value) => value + 1);
    } finally {
      if (fromStream) inFlight.current--;
    }
  }, []);

  useEffect(() => {
    if (stream !== "running") return;
    const timer = window.setInterval(() => {
      if (inFlight.current >= speed || cursor.current >= demoComments.length) return;
      const index = cursor.current++;
      setSent(cursor.current);
      void classify(demoComments[index], demoNames[index % demoNames.length], true);
      if (cursor.current === demoComments.length) setStream("complete");
    }, 1000 / speed);
    return () => window.clearInterval(timer);
  }, [stream, speed, classify]);

  const results = useMemo(() => [...ideas].sort((a, b) => b.votes - a.votes).slice(0, 4), [ideas]);
  const totalVotes = ideas.reduce((total, idea) => total + idea.votes, 0);
  const leader = results[0];
  const completed = processed + failed;
  const avgLatency = processed ? Math.round(latencyTotal / processed) : 0;

  useEffect(() => {
    if (generation.state !== "generating") return;
    const jobId = generation.jobId;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/hedra/jobs/" + encodeURIComponent(jobId));
        const job = await response.json() as HedraJob;
        if (!response.ok || job.status === "FAILED") throw new Error((typeof job.error === "string" ? job.error : job.error?.message) || "Hedra job failed.");
        if (job.status === "COMPLETED") {
          const url = job.outputs?.find((output: { url?: string }) => output.url)?.url;
          if (!url) throw new Error("Hedra returned no video URL.");
          setGeneration({ state: "complete", url });
        }
      } catch (error) {
        setGeneration({ state: "error", message: error instanceof Error ? error.message : "Could not read Hedra job." });
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [generation]);

  async function estimateScene() {
    if (!leader) return;
    setGeneration({ state: "estimating" });
    try {
      const response = await fetch("/api/hedra/estimate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: leader.action, preset }) });
      const data = await response.json() as EstimateResult;
      if (!response.ok) throw new Error(data.error || "Estimate failed.");
      if (typeof data.cost !== "number") throw new Error("No cost estimate returned.");
      setGeneration({ state: "quoted", action: leader.action, cost: data.cost, preset });
    } catch (error) {
      setGeneration({ state: "error", message: error instanceof Error ? error.message : "Estimate failed." });
    }
  }

  async function generateScene() {
    if (generation.state !== "quoted") return;
    const action = generation.action;
    const quotedPreset = generation.preset;
    setGeneration({ state: "submitting" });
    try {
      const image = await fetch(OPENING_FRAME_PATH);
      if (!image.ok) throw new Error("Could not load the opening frame.");
      const form = new FormData();
      form.append("action", action);
      form.append("preset", quotedPreset);
      form.append("openingFrame", await image.blob(), "opening-frame-sophie.png");
      const response = await fetch("/api/hedra/generate", { method: "POST", body: form });
      const job = await response.json() as SubmitResult;
      if (!response.ok) throw new Error(job.error || "Could not submit Hedra job.");
      if (typeof job.job_id !== "string") throw new Error("Hedra returned no job ID.");
      setGeneration({ state: "generating", jobId: job.job_id });
    } catch (error) {
      setGeneration({ state: "error", message: error instanceof Error ? error.message : "Generation failed." });
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    await classify(body, "you", false);
  }

  function reset() {
    if (inFlight.current) return;
    cursor.current = 0; nextId.current = 1; ideasRef.current = [];
    setIdeas([]); setComments([]); setSent(0); setProcessed(0); setJevProcessed(0);
    setOffTopic(0); setFailed(0); setLatencyTotal(0); setStream("idle"); setGeneration({ state: "idle" });
  }

  const hedraLabel = authRequired ? "Sign in required" : !status ? "Checking connections" :
    status.hedraStatus === "ready" ? "Hedra ready · $" + status.hedraBalance?.toFixed(2) :
    status.hedraStatus === "missing" ? "Hedra key missing" :
    status.hedraStatus === "invalid" ? "Hedra key invalid" : "Hedra status unavailable";

  return (
    <main className="min-h-screen bg-[#0e0e10] text-[#efeff1]">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-[#121214] px-4 py-3">
        <span className="grid size-9 place-items-center rounded-md bg-[#9147ff]"><Clapperboard size={19} /></span>
        <div><strong className="text-sm">CrowdCut</strong><span className="ml-2 text-sm text-white/55">/ {STORY_TITLE}</span></div>
        <div className="ml-auto flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-[#26262c] px-2.5 py-1.5 text-white/70">Jev {status?.jev ? "ready" : authRequired ? "sign in" : status ? "simulation" : "checking"}</span>
          <span className="rounded bg-[#26262c] px-2.5 py-1.5 text-white/70">{hedraLabel}</span>
        </div>
      </header>
      {authRequired && <div className="border-b border-amber-400/25 bg-amber-400/10 px-5 py-3 text-sm text-amber-100">Your Site session expired. <a className="underline" href="/signin-with-chatgpt?return_to=%2F">Sign in with ChatGPT</a> to use Jev and Hedra.</div>}
      {status?.hedraStatus === "ready" && status.hedraBalance === 0 && <div className="border-b border-amber-400/25 bg-amber-400/10 px-5 py-3 text-sm text-amber-100">Hedra API wallet is empty. Add funds in <a className="underline" href="https://www.hedra.com/develop/billing" target="_blank" rel="noreferrer">developer billing</a>.</div>}
      <div className="mx-auto grid max-w-[1700px] lg:grid-cols-[minmax(0,1fr)_370px]">
        <section className="min-w-0 p-4 sm:p-6"><div className="mx-auto max-w-[1120px]">
          <div className="mb-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#bf94ff]">Chapter 01 · The threshold</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{STORY_TITLE}</h1><p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/55">Sophie followed her long-lost friend’s shadows to a magical world. Now she stands at the door of a moving castle. What should she do next?</p></div>
          <div className="relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-black shadow-2xl">
            {generation.state === "complete" ? <video src={generation.url} controls autoPlay playsInline className="absolute inset-0 size-full object-cover" /> : <Image src={OPENING_FRAME_PATH} alt="Sophie opens the ornate door of a moving castle in a magical hand-drawn world." fill priority className="object-cover" sizes="(max-width: 1024px) 100vw, 70vw" />}
            {generation.state !== "complete" && <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20" />}
            <div className="absolute left-4 top-4 rounded bg-[#e91916] px-2 py-1 text-[10px] font-bold tracking-widest">LIVE DEMO</div>
            {generation.state !== "complete" && <div className="absolute bottom-5 left-5 max-w-xl"><p className="text-xs font-bold uppercase tracking-widest text-[#39e6c5]">The story begins</p><p className="mt-1 text-xl font-semibold sm:text-2xl">A familiar shadow vanishes inside.</p></div>}
          </div>
          <div className="mt-4 rounded-lg border border-white/10 bg-[#18181b] p-4">
            <div className="mb-4 flex flex-wrap gap-2" aria-label="Video render speed">
              <button type="button" onClick={() => { setPreset("fast"); if (generation.state === "quoted" || generation.state === "error") setGeneration({ state: "idle" }); }} disabled={generation.state === "estimating" || generation.state === "submitting" || generation.state === "generating"} aria-pressed={preset === "fast"} className={"rounded border px-3 py-2 text-sm font-medium disabled:opacity-40 " + (preset === "fast" ? "border-[#9147ff] bg-[#9147ff]/20 text-white" : "border-white/10 text-white/60 hover:bg-white/5")}>Fast · 768p / 5s</button>
              <button type="button" onClick={() => { setPreset("fastest"); if (generation.state === "quoted" || generation.state === "error") setGeneration({ state: "idle" }); }} disabled={generation.state === "estimating" || generation.state === "submitting" || generation.state === "generating"} aria-pressed={preset === "fastest"} className={"rounded border px-3 py-2 text-sm font-medium disabled:opacity-40 " + (preset === "fastest" ? "border-[#9147ff] bg-[#9147ff]/20 text-white" : "border-white/10 text-white/60 hover:bg-white/5")}>Fastest · 480p / 5s</button>
              <button type="button" onClick={() => { setPreset("quality"); if (generation.state === "quoted" || generation.state === "error") setGeneration({ state: "idle" }); }} disabled={generation.state === "estimating" || generation.state === "submitting" || generation.state === "generating"} aria-pressed={preset === "quality"} className={"rounded border px-3 py-2 text-sm font-medium disabled:opacity-40 " + (preset === "quality" ? "border-[#9147ff] bg-[#9147ff]/20 text-white" : "border-white/10 text-white/60 hover:bg-white/5")}>Original · 4K / 8s</button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-widest text-[#bf94ff]">{preset === "quality" ? "MiniMax H3 · 4K · 8 seconds" : "H3 Max Turbo · " + (preset === "fast" ? "768p" : "480p") + " · 5 seconds"}</p><p className="mt-1 text-sm text-white/75">{leader ? "Animate the audience’s leading idea: " + leader.action : "Run the stream or add a comment to find the next scene."}</p></div>
              {generation.state === "quoted" ? <button onClick={generateScene} disabled={status?.hedraBalance != null && status.hedraBalance < generation.cost} className="rounded bg-[#9147ff] px-4 py-2 text-sm font-semibold hover:bg-[#a970ff] disabled:opacity-40">{"Generate · $" + generation.cost.toFixed(2)}</button>
                : <button onClick={estimateScene} disabled={!leader || !status?.hedra || generation.state === "estimating" || generation.state === "submitting" || generation.state === "generating"} className="flex items-center gap-2 rounded bg-[#9147ff] px-4 py-2 text-sm font-semibold hover:bg-[#a970ff] disabled:opacity-40">{generation.state === "estimating" || generation.state === "submitting" || generation.state === "generating" ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}{generation.state === "generating" ? "Rendering…" : "Estimate scene"}</button>}
            </div>
            {generation.state === "error" && <p className="mt-3 text-sm text-[#ff8ca5]">{generation.message}</p>}
            {generation.state === "generating" && <p className="mt-3 text-xs text-[#8cebd8]">Hedra job {generation.jobId} is rendering.</p>}
            <p className="mt-3 text-xs text-white/35">Your opening frame is uploaded to Hedra only when you choose Generate.</p>
          </div>
          <div className="mb-3 mt-8 flex items-end justify-between"><div><h2 className="text-lg font-semibold">Audience directions</h2><p className="text-sm text-white/45">Jev discovers and groups suggestions; it does not force them into predefined branches.</p></div><span className="text-xs text-white/40">{totalVotes} actionable comments</span></div>
          {results.length ? <div className="grid gap-3 sm:grid-cols-2">{results.map((idea, index) => <div key={idea.id} className="rounded-lg border border-white/10 bg-[#18181b] p-4"><div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded" style={{ background: accents[index] + "22", color: accents[index] }}>{index + 1}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{idea.action}</p><div className="mt-3 h-1 rounded bg-white/10"><div className="h-1 rounded" style={{ width: Math.round(idea.votes / totalVotes * 100) + "%", background: accents[index] }} /></div></div><span className="text-sm font-bold" style={{ color: accents[index] }}>{idea.votes}</span></div></div>)}</div>
            : <div className="rounded-lg border border-dashed border-white/15 bg-[#18181b] p-8 text-center text-sm text-white/45">No choices are seeded. Start the demo stream to see what Jev discovers from 200 raw comments.</div>}
        </div></section>
        <aside className="border-t border-white/10 bg-[#18181b] lg:min-h-[calc(100vh-64px)] lg:border-l lg:border-t-0">
          <div className="border-b border-white/10 p-4">
            <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-[#bf94ff]">Stream test</p><h2 className="mt-1 font-semibold">200 audience comments</h2></div><button onClick={reset} disabled={inFlight.current > 0} title="Reset stream" className="rounded p-2 text-white/50 hover:bg-white/10 disabled:opacity-30"><RotateCcw size={17} /></button></div>
            <p className="mt-2 text-xs leading-relaxed text-white/45">Raw comments arrive like live chat. Each goes through the classification API; results and errors stay visible.</p>
            <div className="mt-4 flex gap-2"><button onClick={() => setStream(stream === "running" ? "paused" : "running")} disabled={stream === "complete" || authRequired} className="flex flex-1 items-center justify-center gap-2 rounded bg-[#9147ff] px-3 py-2 text-sm font-semibold hover:bg-[#a970ff] disabled:opacity-40">{stream === "running" ? <Pause size={15} /> : <Play size={15} />}{stream === "running" ? "Pause" : stream === "paused" ? "Resume" : stream === "complete" ? "Complete" : "Start stream"}</button>{[1, 3, 5].map((value) => <button key={value} onClick={() => setSpeed(value as 1 | 3 | 5)} className={"rounded px-2.5 text-xs font-semibold " + (speed === value ? "bg-white/20 text-white" : "bg-white/5 text-white/45")}>{value}×</button>)}</div>
            <div className="mt-4 h-1.5 overflow-hidden rounded bg-white/10"><div className="h-full rounded bg-[#9147ff]" style={{ width: sent / demoComments.length * 100 + "%" }} /></div><div className="mt-2 flex justify-between text-xs text-white/50"><span>{sent}/{demoComments.length} sent · {completed} completed</span><span>{inFlight.current} in flight</span></div>
            <div className="mt-4 grid grid-cols-4 gap-1 rounded bg-[#101013] p-2 text-center"><div><p className="text-lg font-bold text-[#39e6c5]">{jevProcessed}</p><p className="text-[10px] text-white/40">Jev</p></div><div><p className="text-lg font-bold">{offTopic}</p><p className="text-[10px] text-white/40">Off-topic</p></div><div><p className="text-lg font-bold text-[#ff8ca5]">{failed}</p><p className="text-[10px] text-white/40">Failed</p></div><div><p className="text-lg font-bold">{avgLatency}ms</p><p className="text-[10px] text-white/40">Avg time</p></div></div>
            {status && !status.jev && <p className="mt-3 text-xs text-amber-200">Jev key is not available to this Site. Results will be marked simulation.</p>}
          </div>
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><h2 className="text-sm font-semibold">Live chat</h2><span className="text-xs text-white/40">{comments.length} visible</span></div>
          <div className="h-[420px] space-y-3 overflow-y-auto px-4 py-4 lg:h-[calc(100vh-440px)] lg:min-h-[320px]">{comments.length ? comments.slice().reverse().map((comment) => <div key={comment.id} className="text-sm leading-snug"><span className="mr-2 font-semibold text-[#bf94ff]">{comment.name}</span><span className="text-white/75">{comment.body}</span><p className={"mt-1 text-[11px] " + (comment.state === "error" ? "text-[#ff8ca5]" : "text-white/35")}>{comment.state === "pending" ? "Jev is reading…" : comment.state === "error" ? comment.action : comment.action ? comment.state + " → " + comment.action : comment.state + " → off-topic"}</p></div>) : <p className="pt-8 text-center text-sm text-white/35">Chat will appear here when you start the stream.</p>}</div>
          <form onSubmit={submitComment} className="sticky bottom-0 flex gap-2 border-t border-white/10 bg-[#18181b] p-3"><input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500} placeholder="Suggest what Sophie does next…" className="min-w-0 flex-1 rounded border border-white/10 bg-[#0e0e10] px-3 py-2 text-sm outline-none focus:border-[#9147ff]" /><button type="submit" disabled={!draft.trim()} className="rounded bg-[#9147ff] px-3 disabled:opacity-40" aria-label="Send suggestion"><ArrowUp size={17} /></button></form>
        </aside>
      </div>
    </main>
  );
}
