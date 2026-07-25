"use client";

import { AlertTriangle, Check, Loader2, RotateCcw, Save, Send, ShieldAlert, X } from "lucide-react";
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
    if (!demoScenarios.some((item) => item.id === params.get("scenario"))) {
      router.replace(`${pathname}?scenario=${defaultScenarioId}`, { scroll: false });
    }
  }, [params, pathname, router]);

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

  return (
    <main className="scanline min-h-screen px-4 py-2 text-[12px] text-[#f4f7ee]">
      <div className="mx-auto grid max-w-[1440px] grid-cols-[300px_1fr_360px] gap-4 max-xl:grid-cols-[280px_1fr] max-lg:grid-cols-1">
        <aside className="hard-panel p-3">
          <div className="mb-3 border-b border-[#79ffb866] pb-2 text-[11px] text-[#ffce65]">INCIDENT CARTRIDGES</div>
          <div className="space-y-2">
            {demoScenarios.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveScenario(item.id)}
                className={`w-full border px-3 py-2 text-left ${item.id === scenarioId ? "loaded border-[#79ffb8]" : "border-[#33414a] text-[#b7c8c0] hover:border-[#79ffb8]"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{item.cartridgeNumber} {item.title}</span>
                  <span className="text-[10px]">{item.id === scenarioId ? "LOADED" : item.cartridgeNumber <= "04" ? "CORE" : "NICE"}</span>
                </div>
                <div className="mt-1 text-[10px] text-[#68d8ff]">{item.category} / {item.memoryTypes.join("+")}</div>
              </button>
            ))}
          </div>
          <div className="mt-4 border-t border-[#33414a] pt-3 text-[10px] leading-5 text-[#9aa8a0]">
            [1-6] Cartridge · [R] Recall · [A] Accept · [L] Log · [X] Reset
          </div>
        </aside>

        <section className="space-y-4">
          <header className="hard-panel px-4 py-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] text-[#68d8ff]">EXCEPTION//OS</div>
                <h1 className="mt-1 text-xl font-black tracking-normal text-[#79ffb8]">RESTAURANT INTELLIGENCE COMMAND CENTER</h1>
                <p className="mt-1 text-[#c7d6ce]">{scenario.description}</p>
              </div>
              <div className="border border-[#ffce65] px-3 py-2 text-right text-[#ffce65]">
                <div className="text-[10px]">NEON KITCHEN WAR ROOM</div>
                <div className="text-xl">{scenario.cartridgeNumber}</div>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-[1.05fr_1fr] gap-4 max-lg:grid-cols-1">
            <section className="hard-panel p-3">
              <div className="mb-2 flex items-center gap-2 text-[#ffce65]">
                <ShieldAlert size={16} />
                CURRENT INCIDENT
              </div>
              <h2 className="text-xl text-[#ff5d73]">{scenario.alertHeadline}</h2>
              <p className="mt-2 leading-5 text-[#dce7df]">{scenario.currentException.situation}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {scenario.currentException.tags.map((tag) => (
                  <span key={tag} className="border border-[#33414a] px-2 py-1 text-[10px] text-[#68d8ff]">{tag}</span>
                ))}
              </div>
            </section>

            <section className="hard-panel p-3">
              <div className="mb-2 text-[#ffce65]">ASK CONSOLE</div>
              <textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-24 w-full resize-none border border-[#33414a] bg-[#07090c] p-3 text-[#f4f7ee] outline-none focus:border-[#79ffb8]"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="hard-button flex items-center gap-2 px-3 py-2" onClick={ask} disabled={askState === "loading"}>
                  {askState === "loading" ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />}
                  RECALL TRACE
                </button>
                <button className="hard-button flex items-center gap-2 px-3 py-2" onClick={resetScenario} disabled={resetState === "loading"}>
                  <RotateCcw size={15} />
                  RESET SCENARIO
                </button>
              </div>
              <div className="mt-3 min-h-5 text-[11px] text-[#9aa8a0]">
                {askState === "loading" && "MATCHING INCIDENTS / CHECKING OUTCOMES / COMPILING PLAYBOOK"}
                {askState === "success" && response?.providerStatus}
                {resetState === "success" && "Scenario reset complete."}
                {error && <span className="text-[#ff5d73]">{error}</span>}
              </div>
            </section>
          </div>

          <section className="hard-panel p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-[#ffce65]">RECOMMENDATION</div>
              <div className="text-[#68d8ff]">
                CONFIDENCE {displayDecision?.confidence ?? scenario.expectedRecommendation.confidence}%
              </div>
            </div>
            <h2 className="text-2xl text-[#79ffb8]">{displayDecision?.headline ?? "SYSTEM READY"}</h2>
            <p className="mt-2 text-base leading-6 text-[#f4f7ee]">
              {displayDecision?.recommendation ?? "Press RECALL TRACE to dispatch the right restaurant agents."}
            </p>
            <p className="mt-2 leading-6 text-[#b7c8c0]">{displayDecision?.rationale ?? scenario.expectedRecommendation.rationale}</p>
            {displayDecision?.conflictNotes?.map((note) => (
              <div key={note} className="mt-2 border border-[#ffce65] px-3 py-2 text-[#ffce65]">{note}</div>
            ))}
            <div className="mt-4 grid grid-cols-2 gap-3 max-md:grid-cols-1">
              <div>
                <div className="mb-2 text-[11px] text-[#68d8ff]">STRONGEST MEMORIES</div>
                <div className="space-y-2">
                  {strongestMemories.map((memory) => (
                    <div key={memory.id} className="border border-[#33414a] p-2">
                      <div className="flex items-center justify-between gap-2 text-[#ffce65]">
                        <span>{memory.title}</span>
                        <span className="text-[10px] text-[#79ffb8]">{memory.memoryType}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[#c7d6ce]">{memory.content}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[11px] text-[#68d8ff]">ACTION PLAYBOOK</div>
                <ol className="space-y-2">
                  {(displayDecision?.playbookSteps ?? scenario.expectedRecommendation.playbookSteps).map((step, index) => (
                    <li key={step} className="flex gap-2 border border-[#33414a] px-3 py-1.5">
                      <span className="text-[#ffce65]">{String(index + 1).padStart(2, "0")}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>
        </section>

        <aside className="space-y-4 max-xl:col-span-2 max-lg:col-span-1">
          <section className="hard-panel p-3">
            <div className="mb-2 text-[#ffce65]">AGENT DISPATCH TRACE</div>
            {(response?.routing.dispatchReasons ?? [{ agentId: "ORCHESTRATOR", reason: "Awaiting recall request." }]).map((item) => (
              <div key={item.agentId} className="mb-2 border border-[#33414a] px-3 py-2">
                <div className="text-[#79ffb8]">{item.agentId}</div>
                <div className="text-[11px] leading-5 text-[#c7d6ce]">{item.reason}</div>
              </div>
            ))}
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="border border-[#33414a] p-2">MEMORY {response?.health.memoryProvider ?? "MOCK READY"}</div>
                <div className="border border-[#33414a] p-2">ENGINE {response?.health.decisionEngine ?? "DETERMINISTIC"}</div>
              </div>
              {response?.health.decisionStatus && (
                <div className={`mt-2 border px-3 py-2 text-[11px] ${response.health.decisionStatus.ok ? "border-[#79ffb8] text-[#79ffb8]" : "border-[#ffce65] text-[#ffce65]"}`}>
                  {response.health.decisionStatus.message}
                </div>
              )}
          </section>

          <section className="hard-panel p-3">
            <div className="mb-2 text-[#ffce65]">CONFIDENCE SIGNALS</div>
            {(displayDecision?.confidenceSignals ?? scenario.confidenceSignals).map((signal) => (
              <div key={signal.label} className="mb-2 flex items-center justify-between border border-[#33414a] px-3 py-2">
                <span>{signal.label}</span>
                <span className={signal.points >= 0 ? "text-[#79ffb8]" : "text-[#ff5d73]"}>
                  {signal.points > 0 ? "+" : ""}{signal.points}
                </span>
              </div>
            ))}
          </section>

          <section className="hard-panel p-3">
            <div className="mb-2 text-[#ffce65]">MANAGER ACTION</div>
            <div className="flex flex-wrap gap-2">
              <button className="hard-button flex items-center gap-2 px-3 py-2" onClick={() => saveOutcome("ACCEPTED")} disabled={!response || outcomeState === "saving"}>
                <Check size={15} />
                ACCEPT
              </button>
              <button className="hard-button flex items-center gap-2 px-3 py-2 text-[#ffce65]" onClick={() => saveOutcome("OVERRIDDEN")} disabled={outcomeState === "saving"}>
                <X size={15} />
                OVERRIDE
              </button>
              <button className="hard-button flex items-center gap-2 px-3 py-2" onClick={() => saveOutcome("LOGGED")} disabled={outcomeState === "saving"}>
                <Save size={15} />
                LOG OUTCOME
              </button>
            </div>
            <textarea
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
              className="mt-3 h-20 w-full resize-none border border-[#33414a] bg-[#07090c] p-3 text-[#f4f7ee] outline-none focus:border-[#79ffb8]"
            />
            <div className="min-h-6 text-[11px] text-[#79ffb8]">
              {outcomeState === "saving" && "MEMORY PROCESSING"}
              {memoryEvent && memoryEvent.message}
            </div>
          </section>

          <section className="hard-panel p-3">
            <div className="mb-2 flex items-center gap-2 text-[#ffce65]">
              <AlertTriangle size={15} />
              LIVE INTEGRATIONS
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="hard-button px-3 py-2" onClick={checkHealth} disabled={healthState === "loading"}>
                VERIFY LIVE APIS
              </button>
              <button className="hard-button px-3 py-2" onClick={seedXTrace} disabled={seedState === "loading"}>
                SYNC XTRACE
              </button>
            </div>
            <div className="mt-3 space-y-2 text-[11px]">
              <div className="border border-[#33414a] p-2">
                XTRACE: {health?.xtrace.message ?? "Not checked"}
              </div>
              <div className="border border-[#33414a] p-2">
                OPENAI: {health?.openai.message ?? "Not checked"}
              </div>
            </div>
            <p className="mt-3 leading-5 text-[#b7c8c0]">
              Simulated actions require manager approval. Allergy guidance supports staff decisions and does not guarantee food safety.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
