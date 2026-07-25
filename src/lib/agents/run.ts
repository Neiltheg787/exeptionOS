import { agentRegistry } from "@/lib/agents/registry";
import { routeRequest } from "@/lib/agents/orchestrator";
import { aggregateDecision } from "@/lib/decision/aggregator";
import type {
  AgentContext,
  AgentMemoryTrace,
  AgentResult,
  AggregatedDecision,
  MemoryProvider,
  RestaurantMemory,
  RoutingDecision,
} from "@/lib/types";

function buildAgentMemoryTrace(agentResults: AgentResult[], memories: RestaurantMemory[]): AgentMemoryTrace[] {
  const memoryById = new Map(memories.map((memory) => [memory.id, memory]));
  const usedMemoryIds = new Set<string>();
  const traces = agentResults.map((result) => ({
    agentId: result.agentId,
    role: result.role,
    dispatchReason: result.dispatchReason,
    memories: [] as RestaurantMemory[],
  }));

  const candidatesFor = (result: AgentResult) => {
    const evidenceMatches = result.evidenceIds
      .map((id) => memoryById.get(id))
      .filter(Boolean) as RestaurantMemory[];
    const agentMatches = memories.filter((memory) => memory.agentIds?.includes(result.agentId));
    const broadMatches = memories.filter((memory) => !memory.agentIds?.length);
    return [...evidenceMatches, ...agentMatches, ...broadMatches, ...memories]
      .filter((memory, index, list) => list.findIndex((item) => item.id === memory.id) === index)
      .sort((a, b) => (b.similarityScore ?? 0) - (a.similarityScore ?? 0));
  };

  const assignOne = (trace: AgentMemoryTrace, result: AgentResult) => {
    const nextMemory = candidatesFor(result).find((memory) => !usedMemoryIds.has(memory.id));
    if (!nextMemory) return;
    usedMemoryIds.add(nextMemory.id);
    trace.memories.push(nextMemory);
  };

  traces.forEach((trace, index) => assignOne(trace, agentResults[index]!));
  traces.forEach((trace, index) => {
    if (trace.memories.length < 2) assignOne(trace, agentResults[index]!);
  });

  return traces;
}

export async function runAgentFlow(input: {
  query: string;
  branchId: string;
  scenarioId: string;
  memoryProvider: MemoryProvider;
}): Promise<{
  routing: RoutingDecision;
  decision: AggregatedDecision;
  agentMemoryTrace: AgentMemoryTrace[];
  providerStatus: string;
  provider: "XTRACE" | "MOCK" | "CACHE";
}> {
  const routing = await routeRequest(input);
  const selectedIds = [routing.primaryAgent, ...routing.supportingAgents];
  const agents = selectedIds.map((id) => agentRegistry[id]).filter(Boolean);
  const baseContext: AgentContext = {
    query: input.query,
    branchId: input.branchId,
    activeScenarioId: input.scenarioId,
    recalledMemories: [],
  };

  const memoryQueries = Array.from(
    new Set(agents.flatMap((agent) => agent!.buildMemoryQueries(baseContext))),
  );
  const recall = await input.memoryProvider.recall({
    branchId: input.branchId,
    scenarioId: input.scenarioId,
    query: input.query,
    memoryQueries,
  });

  const context = { ...baseContext, recalledMemories: recall.memories };
  const agentResults = await Promise.all(
    agents.map(async (agent) => {
      const result = await agent!.analyze(context);
      return {
        ...result,
        role: agent!.id === routing.primaryAgent ? ("PRIMARY" as const) : ("SUPPORTING" as const),
        dispatchReason:
          routing.dispatchReasons.find((reason) => reason.agentId === agent!.id)?.reason ??
          result.dispatchReason,
      };
    }),
  );

  return {
    routing,
    decision: aggregateDecision({
      scenarioId: input.scenarioId,
      primaryAgent: routing.primaryAgent,
      supportingAgents: routing.supportingAgents,
      agentResults,
      memories: recall.memories,
    }),
    agentMemoryTrace: buildAgentMemoryTrace(agentResults, recall.memories),
    providerStatus: recall.message,
    provider: recall.provider,
  };
}
