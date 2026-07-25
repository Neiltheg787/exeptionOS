import { demoScenarios } from "@/data/scenarios";
import type { MemoryIngestInput, RestaurantMemory } from "@/lib/types";

const loggedOutcomes = new Map<string, RestaurantMemory[]>();
let recallCount = 0;
let ingestCount = 0;

export function getMockMemories(scenarioId: string): RestaurantMemory[] {
  const scenario = demoScenarios.find((item) => item.id === scenarioId);
  const seed = scenario?.historicalMemories ?? [];
  return [...seed, ...(loggedOutcomes.get(scenarioId) ?? [])];
}

export function addMockOutcome(input: MemoryIngestInput): RestaurantMemory {
  ingestCount += 1;
  const memory: RestaurantMemory = {
    id: `mem-${input.scenarioId}-${Date.now()}`,
    scenarioId: input.scenarioId,
    memoryType: "ARTIFACT",
    title:
      input.managerAction === "ACCEPTED"
        ? "NEW PROCEDURE SAVED"
        : "OUTCOME ADDED TO MEMORY",
    content: `${input.decisionHeadline}. Manager action: ${input.managerAction}. Outcome: ${input.outcomeStatus}. Note: ${input.note}`,
    occurredAt: new Date().toISOString(),
    agentIds: input.agentIds,
    category: demoScenarios.find((item) => item.id === input.scenarioId)?.category,
    entities: [input.scenarioId, ...input.agentIds],
    tags: ["manager-outcome", input.managerAction.toLowerCase(), input.outcomeStatus.toLowerCase()],
    outcome: input.outcomeStatus,
    status: input.outcomeStatus === "MONITORING" ? "ACTIVE" : "RESOLVED",
    source: "MOCK",
    similarityScore: 1,
  };
  loggedOutcomes.set(input.scenarioId, [...(loggedOutcomes.get(input.scenarioId) ?? []), memory]);
  return memory;
}

export function resetMockScenario(scenarioId: string) {
  loggedOutcomes.delete(scenarioId);
}

export function bumpRecallCount() {
  recallCount += 1;
}

export function getMockUsage() {
  return { recallCount, ingestCount };
}
