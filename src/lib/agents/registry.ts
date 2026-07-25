import { getScenario } from "@/data/scenarios";
import type { AgentId, AgentResult, RestaurantMemory, SpecialistAgent } from "@/lib/types";

const agentConfig: Record<
  Exclude<AgentId, "ORCHESTRATOR" | "GROWTH">,
  {
    displayName: string;
    description: string;
    priority: number;
    keywords: string[];
    queries: string[];
  }
> = {
  ALLERGY: {
    displayName: "ALLERGY LOCK",
    description: "Blocks unsafe allergen assumptions and requires verified procedures.",
    priority: 1,
    keywords: ["allergy", "allergen", "dairy-free", "gluten-free", "peanut", "shellfish", "cross-contact", "separate pan", "ingredient safety", "cheese", "sauce"],
    queries: ["allergen ingredient facts", "approved allergy procedures", "previous allergy near misses"],
  },
  EQUIPMENT: {
    displayName: "MACHINE GHOST",
    description: "Detects retired equipment workarounds and current maintenance risk.",
    priority: 2,
    keywords: ["fryer", "freezer", "refrigerator", "oven", "thermostat", "maintenance", "broken", "malfunction", "repair", "workaround", "temperature"],
    queries: ["previous equipment incidents", "retired procedures", "maintenance repairs and workarounds"],
  },
  SUPPLIER: {
    displayName: "SUPPLY SENTINEL",
    description: "Compares supplier substitutions, failures, and approved fallbacks.",
    priority: 3,
    keywords: ["supplier", "vendor", "shipment", "delivery", "substitute", "shortage", "out of stock", "86", "lot", "product quality", "harvest gold", "chicken"],
    queries: ["supplier substitutions with complaints", "approved shortage fallbacks", "previous ingredient quality failures"],
  },
  RUSH: {
    displayName: "RUSH COMMANDER",
    description: "Recalls demand spikes, bottlenecks, and peak-period playbooks.",
    priority: 4,
    keywords: ["rush", "concert", "event", "backlog", "ticket time", "delivery spike", "queue", "busy", "staff called out", "peak"],
    queries: ["previous rush incidents", "event demand bottlenecks", "successful peak period playbooks"],
  },
  GUEST_RECOVERY: {
    displayName: "RECOVERY UNIT",
    description: "Finds recovery offers that worked and failed for guest issues.",
    priority: 5,
    keywords: ["complaint", "refund", "delayed pickup", "bad review", "unhappy customer", "replacement", "coupon", "recovery", "returning guest"],
    queries: ["previous guest recovery attempts", "failed coupons", "successful replacement meal recovery"],
  },
  WASTE: {
    displayName: "WASTE WATCH",
    description: "Compares prep quantities, demand patterns, and leftover outcomes.",
    priority: 6,
    keywords: ["waste", "overprep", "leftover", "spoilage", "prep quantity", "batch", "throw away", "forecast", "guacamole"],
    queries: ["overproduction patterns", "prep batch checkpoints", "ingredient waste outcomes"],
  },
  SHIFT_BRIEFING: {
    displayName: "SHIFT ORACLE",
    description: "Compiles a concise manager handoff across unresolved issues.",
    priority: 8,
    keywords: ["what should i know", "shift handoff", "unresolved", "open issues", "next shift", "summarize", "priorities", "briefing"],
    queries: ["open restaurant operations issues", "manager shift handoff", "unresolved incidents"],
  },
};

function keywordScore(query: string, keywords: string[]) {
  const normalized = query.toLowerCase();
  return keywords.filter((keyword) => normalized.includes(keyword)).length;
}

function topEvidence(memories: RestaurantMemory[], agentId: AgentId) {
  return memories
    .filter((memory) => !memory.agentIds?.length || memory.agentIds.includes(agentId))
    .sort((a, b) => (b.similarityScore ?? 0) - (a.similarityScore ?? 0))
    .slice(0, 4);
}

function buildAgent(id: Exclude<AgentId, "ORCHESTRATOR" | "GROWTH">): SpecialistAgent {
  const config = agentConfig[id];
  return {
    id,
    displayName: config.displayName,
    description: config.description,
    priority: config.priority,
    async canHandle(input) {
      const score = keywordScore(`${input.query} ${input.currentIncident?.situation ?? ""}`, config.keywords);
      const categoryMatch =
        (id === "SUPPLIER" && input.currentIncident?.category === "SUPPLIER") ||
        (id === "EQUIPMENT" && input.currentIncident?.category === "EQUIPMENT") ||
        (id === "RUSH" && input.currentIncident?.category === "RUSH") ||
        (id === "ALLERGY" && input.currentIncident?.tags.some((tag) => ["allergy", "dairy-free"].includes(tag))) ||
        (id === "GUEST_RECOVERY" && input.currentIncident?.tags.some((tag) => tag.includes("recovery") || tag.includes("complaint"))) ||
        (id === "WASTE" && input.currentIncident?.tags.some((tag) => tag.includes("waste") || tag.includes("prep")));
      const confidence = Math.min(0.98, score * 0.22 + (categoryMatch ? 0.4 : 0));
      return {
        match: confidence >= 0.34,
        confidence,
        reason: categoryMatch
          ? `${config.displayName} matches the loaded incident category and request terms.`
          : `${config.displayName} matched ${score} request signal${score === 1 ? "" : "s"}.`,
      };
    },
    buildMemoryQueries(context) {
      const scenario = getScenario(context.activeScenarioId);
      const entities = context.currentIncident?.tags.join(", ") ?? scenario.title;
      return config.queries.map((query) => `${query}: ${entities}`);
    },
    async analyze(context): Promise<AgentResult> {
      const scenario = getScenario(context.activeScenarioId);
      const evidence = topEvidence(context.recalledMemories, id);
      const isPrimaryScenarioAgent =
        scenario.currentException.category === "SUPPLIER" && id === "SUPPLIER" ||
        scenario.currentException.category === "EQUIPMENT" && id === "EQUIPMENT" ||
        scenario.currentException.category === "RUSH" && id === "RUSH" ||
        scenario.id === "allergy-lock" && id === "ALLERGY" ||
        scenario.id === "recovery-mode" && id === "GUEST_RECOVERY" ||
        scenario.id === "waste-watch" && id === "WASTE";

      const recommendation = isPrimaryScenarioAgent
        ? scenario.expectedRecommendation
        : {
            headline: `${config.displayName} SUPPORT READY`,
            recommendation: `Support the active plan with ${config.displayName.toLowerCase()} checks.`,
            rationale: `${config.displayName} found ${evidence.length} supporting memory trace${evidence.length === 1 ? "" : "s"}.`,
            riskLevel: "MEDIUM" as const,
            playbookSteps: [],
            confidenceSignals: [],
          };

      return {
        agentId: id,
        role: "SUPPORTING",
        dispatchReason: `${config.displayName} selected from request and incident signals.`,
        headline: recommendation.headline,
        recommendation: recommendation.recommendation,
        rationale: recommendation.rationale,
        evidenceIds: evidence.map((item) => item.id),
        playbookSteps: recommendation.playbookSteps,
        riskLevel: recommendation.riskLevel,
        confidenceSignals: isPrimaryScenarioAgent ? scenario.confidenceSignals : [],
        proposedActions: [
          {
            id: `${id.toLowerCase()}-safe-action`,
            label: isPrimaryScenarioAgent ? "SIMULATED ACTION READY" : "SUPPORTING CHECK READY",
            kind: "SIMULATED",
            description: "No external system is called. Manager approval is required before action.",
          },
        ],
        requiresHumanConfirmation: id === "ALLERGY" || id === "EQUIPMENT",
      };
    },
  };
}

export const agentRegistry: Record<AgentId, SpecialistAgent | null> = {
  ORCHESTRATOR: null,
  SUPPLIER: buildAgent("SUPPLIER"),
  EQUIPMENT: buildAgent("EQUIPMENT"),
  RUSH: buildAgent("RUSH"),
  ALLERGY: buildAgent("ALLERGY"),
  GUEST_RECOVERY: buildAgent("GUEST_RECOVERY"),
  WASTE: buildAgent("WASTE"),
  SHIFT_BRIEFING: buildAgent("SHIFT_BRIEFING"),
  GROWTH: null,
};

export const operationalAgents = Object.values(agentRegistry).filter(Boolean) as SpecialistAgent[];
