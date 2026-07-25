import { getScenario } from "@/data/scenarios";
import type { AgentId, AgentResult, AggregatedDecision, RestaurantMemory } from "@/lib/types";

const priority: Record<AgentId, number> = {
  ORCHESTRATOR: 0,
  ALLERGY: 1,
  EQUIPMENT: 2,
  SUPPLIER: 3,
  RUSH: 4,
  GUEST_RECOVERY: 5,
  WASTE: 6,
  GROWTH: 7,
  SHIFT_BRIEFING: 8,
};

const riskScore = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

export function calculateConfidence(signals: AgentResult["confidenceSignals"]) {
  const total = signals.reduce((sum, signal) => sum + (signal.matched ? signal.points : 0), 0);
  return Math.max(35, Math.min(97, total));
}

export function aggregateDecision(input: {
  scenarioId: string;
  primaryAgent: AgentId;
  supportingAgents: AgentId[];
  agentResults: AgentResult[];
  memories: RestaurantMemory[];
}): AggregatedDecision {
  const scenario = getScenario(input.scenarioId);
  const primary =
    input.agentResults.find((result) => result.agentId === input.primaryAgent) ??
    input.agentResults.sort((a, b) => priority[a.agentId] - priority[b.agentId])[0]!;
  const allEvidenceIds = new Set(input.agentResults.flatMap((result) => result.evidenceIds));
  const evidence = input.memories.filter((memory) => allEvidenceIds.has(memory.id)).slice(0, 5);
  const playbookSteps = Array.from(
    new Set(input.agentResults.flatMap((result) => result.playbookSteps).filter(Boolean)),
  );
  const confidenceSignals =
    primary.confidenceSignals.length > 0 ? primary.confidenceSignals : scenario.confidenceSignals;
  const conflictNotes =
    input.agentResults.some((result) => result.agentId === "ALLERGY") && input.agentResults.length > 1
      ? ["Safety-related guidance overrides lower-priority commercial or speed recommendations."]
      : input.agentResults.some((result) => result.agentId === "EQUIPMENT") && input.agentResults.length > 1
        ? ["Equipment safety risk overrides speed-focused rush recommendations."]
        : undefined;

  return {
    primaryAgent: primary.agentId,
    supportingAgents: input.supportingAgents,
    headline: primary.headline,
    recommendation: primary.recommendation,
    rationale: primary.rationale,
    evidence,
    playbookSteps,
    riskLevel: input.agentResults.reduce(
      (max, result) => (riskScore[result.riskLevel] > riskScore[max] ? result.riskLevel : max),
      primary.riskLevel,
    ),
    confidence: calculateConfidence(confidenceSignals),
    confidenceSignals,
    proposedActions: input.agentResults.flatMap((result) => result.proposedActions).slice(0, 3),
    requiresHumanConfirmation: input.agentResults.some((result) => result.requiresHumanConfirmation),
    conflictNotes,
  };
}
