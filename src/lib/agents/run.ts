import { agentRegistry } from "@/lib/agents/registry";
import { routeRequest } from "@/lib/agents/orchestrator";
import { aggregateDecision } from "@/lib/decision/aggregator";
import type { AgentContext, AggregatedDecision, MemoryProvider, RoutingDecision } from "@/lib/types";

export async function runAgentFlow(input: {
  query: string;
  branchId: string;
  scenarioId: string;
  memoryProvider: MemoryProvider;
}): Promise<{
  routing: RoutingDecision;
  decision: AggregatedDecision;
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
    providerStatus: recall.message,
    provider: recall.provider,
  };
}
