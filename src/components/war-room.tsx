"use client";

import {
  AlertTriangle,
  Check,
  Database,
  Loader2,
  Radar,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { defaultScenarioId, demoScenarios, getScenario } from "@/data/scenarios";
import type {
  AggregatedDecision,
  AgentId,
  DemoScenario,
  IntegrationStatus,
  MemoryIngestResult,
  RoutingDecision,
} from "@/lib/types";

type AskResponse = {
  query: string;
  scenario: DemoScenario;
  routing: RoutingDecision;
  decision: AggregatedDecision;
  provider: "XTRACE" | "MOCK" | "CACHE";
  providerStatus: string;
  health: {
    memoryProvider: string;
    decisionEngine: string;
    decisionStatus: IntegrationStatus;
  };
};

type HealthResponse = {
  xtrace: IntegrationStatus;
  openai: IntegrationStatus;
  ok: boolean;
};

const outcomePresets: Record<string, string> = {
  "supplier-loop": "Supplier substitute rejected. Smoked tofu bowl activated. No texture complaints reported.",
  "fryer-ghost": "Fried items paused. Thermometer confirmed unstable temperature. Maintenance contacted.",
  "rush-protocol": "Rush protocol activated. Peak ticket time stayed below 21 minutes.",
  "allergy-lock": "Chef verified approved substitution. Guest informed of preparation limitations.",
  "recovery-mode": "Replacement meal and manager note offered. Follow-up return will be tracked.",
  "waste-watch": "Reduced batch prepared. 7 p.m. checkpoint prevented overprep without stockout.",
};

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

function statusTone(ok?: boolean) {
  if (ok === true) return "border-emerald-400/35 bg-emerald-400/10 text-emerald-200";
  if (ok === false) return "border-amber-400/35 bg-amber-400/10 text-amber-100";
  return "border-white/10 bg-white/[0.04] text-slate-300";
}

export function WarRoom() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initialScenario = demoScenarios.some((item) => item.id === params.get("scenario"))
    ? params.get("scenario")!
    : defaultScenarioId;
  const [scenarioId, setScenarioId] = useState(initialScenario);
  const scenario = getScenario(scenarioId);
  const [query, setQuery] = useState(scenario.suggestedQuestions[0] ?? "");
  const [askState, setAskState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [outcomeState, setOutcomeState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [resetState, setResetState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [outcome, setOutcome] = useState(outcomePresets[scenarioId]);
  const [error, setError] = useState("");
  const [memoryEvent, setMemoryEvent] = useState<MemoryIngestResult | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthState, setHealthState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [seedState, setSeedState] = useState<"idle" | "loading" | "success" | "error">("idle");

  const setActiveScenario = useCallback(
    (nextScenarioId: string) => {
      const next = getScenario(nextScenarioId);
      setScenarioId(next.id);
      setQuery(next.suggestedQuestions[0] ?? "");
      setResponse(null);
      setMemoryEvent(null);
      setError("");
      setHealth(null);
      setOutcome(outcomePresets[next.id]);
      setAskState("idle");
      setOutcomeState("idle");
      setResetState("idle");
      router.replace(`${pathname}?scenario=${next.id}`, { scroll: false });
    },
    [pathname, router],
  );

  useEffect(() => {
    if (!demoScenarios.some((item) => item.id === params.get("scenario")) || params.has("demo")) {
      router.replace(`${pathname}?scenario=${initialScenario}`, { scroll: false });
    }
  }, [initialScenario, params, pathname, router]);

  const ask = useCallback(async () => {
    setAskState("loading");
    setOutcomeState("idle");
    setMemoryEvent(null);
    setError("");
    try {
      const result = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, query }),
      });
      const json = await result.json();
      if (!result.ok) throw new Error(json.message ?? "Recall failed");
      setResponse(json);
      setAskState("success");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Recall failed");
      setAskState("error");
    }
  }, [query, scenarioId]);

  const saveOutcome = useCallback(
    async (managerAction: "ACCEPTED" | "OVERRIDDEN" | "LOGGED") => {
      setOutcomeState("saving");
      setError("");
      try {
        const result = await fetch("/api/outcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenarioId,
            query,
            managerAction,
            outcomeStatus: managerAction === "OVERRIDDEN" ? "MONITORING" : "SUCCESS",
            note: outcome,
            decisionHeadline: response?.decision.headline ?? scenario.alertHeadline,
            agentIds: response
              ? ([response.decision.primaryAgent, ...response.decision.supportingAgents] as AgentId[])
              : (["ORCHESTRATOR"] as AgentId[]),
          }),
        });
        const json = await result.json();
        if (!result.ok) throw new Error(json.message ?? "Outcome save failed");
        setMemoryEvent(json);
        setOutcomeState("success");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Outcome save failed");
        setOutcomeState("error");
      }
    },
    [outcome, query, response, scenario.alertHeadline, scenarioId],
  );

  const resetScenario = useCallback(async () => {
    setResetState("loading");
    setError("");
    try {
      const result = await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId }),
      });
      const json = await result.json();
      if (!result.ok) throw new Error(json.message ?? "Reset failed");
      setResponse(null);
      setMemoryEvent(null);
      setOutcome(outcomePresets[scenarioId]);
      setAskState("idle");
      setOutcomeState("idle");
      setResetState("success");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reset failed");
      setResetState("error");
    }
  }, [scenarioId]);

  const checkHealth = useCallback(async () => {
    setHealthState("loading");
    setError("");
    try {
      const result = await fetch("/api/health");
      const json = await result.json();
      if (!result.ok) throw new Error(json.message ?? "Health check failed");
      setHealth(json);
      setHealthState("success");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Health check failed");
      setHealthState("error");
    }
  }, []);

  const seedXTrace = useCallback(async () => {
    setSeedState("loading");
    setError("");
    try {
      const result = await fetch("/api/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const json = await result.json();
      if (!result.ok) throw new Error(json.message ?? "XTrace sync failed");
      setSeedState("success");
      await checkHealth();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "XTrace sync failed");
      setSeedState("error");
    }
  }, [checkHealth]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (/^[1-6]$/.test(event.key)) {
        setActiveScenario(demoScenarios[Number(event.key) - 1]?.id ?? defaultScenarioId);
      }
      if (event.key.toLowerCase() === "r") void ask();
      if (event.key.toLowerCase() === "a" && response) void saveOutcome("ACCEPTED");
      if (event.key.toLowerCase() === "l") void saveOutcome("LOGGED");
      if (event.key.toLowerCase() === "x") void resetScenario();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [ask, resetScenario, response, saveOutcome, setActiveScenario]);

  const displayDecision = response?.decision;
  const strongestMemories = useMemo(
    () => (displayDecision?.evidence ?? scenario.historicalMemories).slice(0, 2),
    [displayDecision, scenario.historicalMemories],
  );
  const confidence = displayDecision?.confidence ?? scenario.expectedRecommendation.confidence;
  const activeAgents = response
    ? [response.decision.primaryAgent, ...response.decision.supportingAgents]
    : ["ORCHESTRATOR"];

  return (
    <main className="min-h-screen px-5 py-5 text-sm text-slate-100">
      <div className="mx-auto grid max-w-[1480px] grid-cols-[292px_minmax(0,1fr)_340px] gap-5 max-xl:grid-cols-[280px_1fr] max-lg:grid-cols-1">
        <aside className="modern-panel sticky top-5 h-[calc(100vh-40px)] p-4 max-lg:static max-lg:h-auto">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="eyebrow">Workspace</p>
              <h2 className="text-base font-semibold text-white">Incident cartridges</h2>
            </div>
            <div className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-1 text-xs text-violet-200">
              {demoScenarios.length}
            </div>
          </div>

          <div className="space-y-2">
            {demoScenarios.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveScenario(item.id)}
                className={`scenario-button ${item.id === scenarioId ? "scenario-button-active" : ""}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-400">{item.cartridgeNumber}</span>
                  <span className="flex-1 truncate text-left font-medium">{item.title}</span>
                  <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-slate-300">
                    {item.category}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.memoryTypes.slice(0, 3).map((type) => (
                    <span key={type} className="memory-chip">
                      {type}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-slate-400">
            Shortcuts: `1-6` switch cartridges, `R` recalls, `A` accepts, `L` logs, `X` resets.
          </div>
        </aside>

        <section className="space-y-5">
          <header className="modern-panel overflow-hidden p-5">
            <div className="flex items-start justify-between gap-5 max-md:flex-col">
              <div>
                <p className="eyebrow">EXCEPTION//OS</p>
                <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-normal text-white">
                  Restaurant Intelligence Command Center
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                  Ask one operational question. The right agents recall history, explain the evidence,
                  recommend a playbook, and save the result for the next shift.
                </p>
              </div>
              <div className="grid min-w-[220px] grid-cols-2 gap-2">
                <div className="stat-tile">
                  <span>Memory</span>
                  <strong>{response?.health.memoryProvider ?? "MOCK"}</strong>
                </div>
                <div className="stat-tile">
                  <span>Engine</span>
                  <strong>{response?.health.decisionEngine ?? "RULES"}</strong>
                </div>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-[0.95fr_1.05fr] gap-5 max-lg:grid-cols-1">
            <section className="modern-panel p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={18} className="text-violet-300" />
                  <p className="section-label">Current incident</p>
                </div>
                <span className="rounded-full border border-rose-400/30 bg-rose-400/10 px-3 py-1 text-xs text-rose-100">
                  Severity {scenario.currentException.severity}
                </span>
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-white">{scenario.alertHeadline}</h2>
              <p className="mt-3 leading-6 text-slate-300">{scenario.currentException.situation}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {scenario.currentException.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-violet-300/15 bg-violet-400/10 px-3 py-1 text-xs text-violet-100">
                    {tag}
                  </span>
                ))}
              </div>
            </section>

            <section className="modern-panel p-5">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles size={18} className="text-cyan-300" />
                <p className="section-label">Ask console</p>
              </div>
              <textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-h-32 w-full resize-none rounded-lg border border-white/10 bg-slate-950/70 p-4 leading-6 text-slate-100 outline-none transition focus:border-violet-300/60 focus:ring-4 focus:ring-violet-500/10"
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <button className="primary-button" onClick={() => void ask()} disabled={askState === "loading"}>
                  {askState === "loading" ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                  Recall trace
                </button>
                <button className="secondary-button" onClick={resetScenario} disabled={resetState === "loading"}>
                  <RotateCcw size={16} />
                  Reset
                </button>
              </div>
              <div className="mt-3 min-h-5 text-xs text-slate-400">
                {askState === "loading" && "Matching incidents, checking outcomes, compiling playbook..."}
                {askState === "success" && response?.providerStatus}
                {resetState === "success" && "Scenario reset complete."}
                {error && <span className="text-rose-200">{error}</span>}
              </div>
            </section>
          </div>

          <section className="modern-panel p-5">
            <div className="flex items-start justify-between gap-5 max-md:flex-col">
              <div>
                <p className="section-label">Recommendation</p>
                <h2 className="mt-3 text-3xl font-semibold text-white">
                  {displayDecision?.headline ?? "Ready for recall"}
                </h2>
              </div>
              <div className="confidence-ring">
                <span>{confidence}%</span>
                <small>confidence</small>
              </div>
            </div>
            <p className="mt-4 text-lg leading-7 text-slate-100">
              {displayDecision?.recommendation ?? "Press Recall trace to dispatch agents and build the evidence-backed playbook."}
            </p>
            <p className="mt-3 max-w-4xl leading-6 text-slate-300">
              {displayDecision?.rationale ?? scenario.expectedRecommendation.rationale}
            </p>
            {displayDecision?.conflictNotes?.map((note) => (
              <div key={note} className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-amber-100">
                {note}
              </div>
            ))}

            <div className="mt-5 grid grid-cols-2 gap-5 max-lg:grid-cols-1">
              <div>
                <p className="section-label mb-3">Strongest memories</p>
                <div className="space-y-3">
                  {strongestMemories.map((memory) => (
                    <article key={memory.id} className="memory-card">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-medium text-white">{memory.title}</h3>
                        <span className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-[11px] text-cyan-100">
                          {memory.memoryType}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-3 leading-6 text-slate-300">{memory.content}</p>
                    </article>
                  ))}
                </div>
              </div>

              <div>
                <p className="section-label mb-3">Action playbook</p>
                <ol className="space-y-2">
                  {(displayDecision?.playbookSteps ?? scenario.expectedRecommendation.playbookSteps).map((step, index) => (
                    <li key={step} className="playbook-row">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <p>{step}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>
        </section>

        <aside className="space-y-5 max-xl:col-span-2 max-lg:col-span-1">
          <section className="modern-panel p-5">
            <div className="mb-4 flex items-center gap-2">
              <Radar size={18} className="text-violet-300" />
              <p className="section-label">Agent dispatch</p>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {activeAgents.map((agent) => (
                <span key={agent} className="agent-pill">
                  {agent}
                </span>
              ))}
            </div>
            <div className="space-y-3">
              {(response?.routing.dispatchReasons ?? [{ agentId: "ORCHESTRATOR", reason: "Awaiting recall request." }]).map((item) => (
                <div key={item.agentId} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                  <p className="font-medium text-white">{item.agentId}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{item.reason}</p>
                </div>
              ))}
            </div>
            {response?.health.decisionStatus && (
              <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${statusTone(response.health.decisionStatus.ok)}`}>
                {response.health.decisionStatus.message}
              </div>
            )}
          </section>

          <section className="modern-panel p-5">
            <p className="section-label mb-3">Confidence signals</p>
            <div className="space-y-2">
              {(displayDecision?.confidenceSignals ?? scenario.confidenceSignals).map((signal) => (
                <div key={signal.label} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2">
                  <span className="text-slate-300">{signal.label}</span>
                  <span className={signal.points >= 0 ? "text-emerald-200" : "text-rose-200"}>
                    {signal.points > 0 ? "+" : ""}
                    {signal.points}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="modern-panel p-5">
            <p className="section-label mb-3">Manager action</p>
            <div className="grid grid-cols-2 gap-2">
              <button className="primary-button justify-center" onClick={() => saveOutcome("ACCEPTED")} disabled={!response || outcomeState === "saving"}>
                <Check size={16} />
                Accept
              </button>
              <button className="secondary-button justify-center" onClick={() => saveOutcome("OVERRIDDEN")} disabled={outcomeState === "saving"}>
                <X size={16} />
                Override
              </button>
              <button className="secondary-button col-span-2 justify-center" onClick={() => saveOutcome("LOGGED")} disabled={outcomeState === "saving"}>
                <Save size={16} />
                Log outcome
              </button>
            </div>
            <textarea
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
              className="mt-3 min-h-24 w-full resize-none rounded-lg border border-white/10 bg-slate-950/70 p-3 leading-5 text-slate-100 outline-none transition focus:border-violet-300/60 focus:ring-4 focus:ring-violet-500/10"
            />
            <div className="min-h-6 text-xs text-emerald-200">
              {outcomeState === "saving" && "Saving memory..."}
              {memoryEvent && memoryEvent.message}
            </div>
          </section>

          <section className="modern-panel p-5">
            <div className="mb-3 flex items-center gap-2">
              <Database size={18} className="text-cyan-300" />
              <p className="section-label">Live integrations</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="secondary-button" onClick={checkHealth} disabled={healthState === "loading"}>
                Verify APIs
              </button>
              <button className="secondary-button" onClick={seedXTrace} disabled={seedState === "loading"}>
                Sync XTrace
              </button>
            </div>
            <div className="mt-3 space-y-2 text-xs">
              <div className={`rounded-lg border p-3 ${statusTone(health?.xtrace.ok)}`}>
                XTrace: {health?.xtrace.message ?? "Not checked"}
              </div>
              <div className={`rounded-lg border p-3 ${statusTone(health?.openai.ok)}`}>
                OpenAI: {health?.openai.message ?? "Not checked"}
              </div>
            </div>
            <div className="mt-3 flex gap-2 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <p>Simulated actions require manager approval. Allergy guidance supports staff decisions and does not guarantee food safety.</p>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
