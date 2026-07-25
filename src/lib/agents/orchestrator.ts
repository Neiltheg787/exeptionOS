import { getScenario } from "@/data/scenarios";
import { operationalAgents } from "@/lib/agents/registry";
import type { AgentId, RestaurantException, RoutingDecision } from "@/lib/types";

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

function extractEntities(query: string, currentIncident?: RestaurantException) {
  const text = `${query} ${currentIncident?.situation ?? ""} ${currentIncident?.tags.join(" ") ?? ""}`.toLowerCase();
  return {
    ingredients: ["chicken", "cheese", "sauce", "guacamole", "tofu"].filter((item) => text.includes(item)),
    equipment: ["fryer", "thermostat", "oven", "freezer", "refrigerator"].filter((item) => text.includes(item)),
    suppliers: ["Harvest Gold Lot B", "supplier", "vendor"].filter((item) => text.includes(item.toLowerCase())),
    menuItems: ["smoked tofu bowl", "chicken dish", "fried items"].filter((item) => text.includes(item.toLowerCase())),
    guestConcerns: ["dairy-free", "complaint", "refund", "delayed pickup", "allergy"].filter((item) => text.includes(item)),
    events: ["concert", "rush", "delivery spike"].filter((item) => text.includes(item)),
    timeConstraints: ["75 minutes", "90 minutes", "9:30", "7 p.m."].filter((item) => text.includes(item)),
  };
}

export async function routeRequest(input: {
  query: string;
  scenarioId?: string;
  currentIncident?: RestaurantException;
}): Promise<RoutingDecision> {
  const scenario = getScenario(input.scenarioId);
  const currentIncident = input.currentIncident ?? scenario.currentException;
  const matches = await Promise.all(
    operationalAgents.map(async (agent) => ({
      agent,
      result: await agent.canHandle({ query: input.query, currentIncident }),
    })),
  );

  const selected = matches
    .filter((match) => match.result.match)
    .sort((a, b) => {
      if (Math.abs(b.result.confidence - a.result.confidence) > 0.05) {
        return b.result.confidence - a.result.confidence;
      }
      return priority[a.agent.id] - priority[b.agent.id];
    });

  const safety = selected.find((match) => match.agent.id === "ALLERGY" || match.agent.id === "EQUIPMENT");
  const primary = safety ?? selected[0] ?? matches.find((match) => match.agent.id === "SHIFT_BRIEFING")!;
  const supports = selected
    .filter((match) => match.agent.id !== primary.agent.id)
    .sort((a, b) => priority[a.agent.id] - priority[b.agent.id])
    .slice(0, 2);

  return {
    primaryAgent: primary.agent.id,
    supportingAgents: supports.map((item) => item.agent.id),
    detectedIntents: [scenario.alertHeadline, currentIncident.category, ...currentIncident.tags.slice(0, 3)],
    detectedEntities: extractEntities(input.query, currentIncident),
    routingConfidence: Math.round(Math.max(primary.result.confidence, 0.52) * 100),
    dispatchReasons: [primary, ...supports].map((item) => ({
      agentId: item.agent.id,
      reason: item.result.reason,
    })),
  };
}
