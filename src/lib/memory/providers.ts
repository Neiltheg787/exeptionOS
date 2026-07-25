import { MemoryClient, type Memory as XTraceMemory } from "@xtraceai/memory";
import { getScenario } from "@/data/scenarios";
import {
  addMockOutcome,
  bumpRecallCount,
  getMockMemories,
  getMockUsage,
  resetMockScenario,
} from "@/lib/memory/mock-store";
import type {
  MemoryIngestInput,
  MemoryIngestResult,
  MemoryProvider,
  MemoryRecallInput,
  MemoryRecallResult,
  MemoryUsage,
  RecentMemoryInput,
  ResetMemoryInput,
  RestaurantMemory,
} from "@/lib/types";

const branchId = "palo-alto-01";
const appId = "exception-os";

function withTimeout<T>(promise: Promise<T>, ms = 4500): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("XTrace request timed out")), ms);
    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => clearTimeout(timer));
  });
}

function normalizeXTraceMemory(memory: XTraceMemory, scenarioId: string): RestaurantMemory {
  const typeMap: Record<XTraceMemory["type"], RestaurantMemory["memoryType"]> = {
    fact: "SEMANTIC",
    artifact: "ARTIFACT",
    episode: "EPISODIC",
    lesson: "PROCEDURAL",
    procedure: "PROCEDURAL",
  };

  return {
    id: memory.id,
    scenarioId,
    memoryType: typeMap[memory.type],
    title: memory.text.split(".")[0]?.slice(0, 80) || "XTrace memory",
    content: memory.text,
    occurredAt: memory.created_at,
    entities: [],
    tags: [...memory.categories, scenarioId],
    source: "XTRACE",
    similarityScore: memory.score ?? undefined,
    status: "ACTIVE",
  };
}

class MockMemoryProvider implements MemoryProvider {
  async recall(input: MemoryRecallInput): Promise<MemoryRecallResult> {
    bumpRecallCount();
    const tokens = [input.query, ...input.memoryQueries].join(" ").toLowerCase();
    const memories = getMockMemories(input.scenarioId)
      .map((memory) => {
        const haystack = [
          memory.title,
          memory.content,
          ...memory.entities,
          ...memory.tags,
          memory.outcome ?? "",
          memory.status ?? "",
        ]
          .join(" ")
          .toLowerCase();
        const overlap = tokens
          .split(/[^a-z0-9]+/)
          .filter((token) => token.length > 3 && haystack.includes(token)).length;
        return { ...memory, similarityScore: memory.similarityScore ?? Math.min(0.98, 0.62 + overlap / 25) };
      })
      .sort((a, b) => (b.similarityScore ?? 0) - (a.similarityScore ?? 0));

    return {
      memories,
      provider: "MOCK",
      status: "READY",
      message: "Mock memory ready. Scenario memories are isolated in the demo session.",
    };
  }

  async ingest(input: MemoryIngestInput): Promise<MemoryIngestResult> {
    const memory = addMockOutcome(input);
    return {
      memory,
      provider: "MOCK",
      status: "SAVED",
      message: input.managerAction === "ACCEPTED" ? "NEW PROCEDURE SAVED" : "OUTCOME ADDED TO MEMORY",
    };
  }

  async getRecentMemories(input: RecentMemoryInput): Promise<RestaurantMemory[]> {
    return getMockMemories(input.scenarioId ?? getScenario().id).slice(-(input.limit ?? 6));
  }

  async getUsage(): Promise<MemoryUsage> {
    return { provider: "MOCK", ...getMockUsage() };
  }

  async resetDemoState(input: ResetMemoryInput): Promise<void> {
    resetMockScenario(input.scenarioId);
  }
}

class XTraceMemoryProvider implements MemoryProvider {
  private client: MemoryClient;
  private groupId: string;

  constructor(apiKey: string, groupId: string) {
    this.client = new MemoryClient({ apiKey });
    this.groupId = groupId;
  }

  async recall(input: MemoryRecallInput): Promise<MemoryRecallResult> {
    const queries = input.memoryQueries.length ? input.memoryQueries : [input.query];
    const results = await Promise.all(
      queries.slice(0, 5).map((query) =>
        withTimeout(
          this.client.memories.search({
            query,
            user_id: input.branchId,
            group_ids: [this.groupId],
            app_id: appId,
            mode: "retrieve",
            limit: 5,
          }),
        ),
      ),
    );
    const seen = new Set<string>();
    const xtraceMemories = results
      .flatMap((result) => result.data)
      .filter((memory) => {
        if (seen.has(memory.id)) return false;
        seen.add(memory.id);
        return true;
      })
      .map((memory) => normalizeXTraceMemory(memory, input.scenarioId));

    const fallbackSeeds = getMockMemories(input.scenarioId).map((memory) => ({
      ...memory,
      source: "CACHE" as const,
    }));

    return {
      memories: [...xtraceMemories, ...fallbackSeeds].slice(0, 8),
      provider: "XTRACE",
      status: "READY",
      message: "XTrace recall completed with cached scenario seeds available for demo stability.",
    };
  }

  async ingest(input: MemoryIngestInput): Promise<MemoryIngestResult> {
    const localMemory = addMockOutcome(input);
    await withTimeout(
      this.client.memories.ingest({
        user_id: input.branchId,
        conv_id: `${input.scenarioId}-${Date.now()}`,
        app_id: appId,
        agent_id: input.agentIds[0] ?? "ORCHESTRATOR",
        group_ids: [this.groupId],
        messages: [
          {
            role: "user",
            content: input.query,
          },
          {
            role: "assistant",
            content: `${input.decisionHeadline}. ${input.note}`,
          },
        ],
      }),
      3500,
    );

    return {
      memory: { ...localMemory, source: "CACHE" },
      provider: "XTRACE",
      status: "PROCESSING",
      message: "MEMORY PROCESSING. Local event is visible immediately while XTrace extracts it.",
    };
  }

  async getRecentMemories(input: RecentMemoryInput): Promise<RestaurantMemory[]> {
    return getMockMemories(input.scenarioId ?? getScenario().id);
  }
}

class CachedMemoryProvider implements MemoryProvider {
  private cache = new Map<string, MemoryRecallResult>();

  constructor(
    private primary: MemoryProvider,
    private fallback: MemoryProvider,
    private strictXTrace: boolean,
  ) {}

  async recall(input: MemoryRecallInput): Promise<MemoryRecallResult> {
    const key = [
      input.branchId,
      input.scenarioId,
      input.query.trim().toLowerCase(),
      input.currentIncident?.id ?? "",
    ].join(":");
    if (this.cache.has(key)) {
      const cached = this.cache.get(key)!;
      return { ...cached, provider: "CACHE", message: "Cached recall result reused for demo stability." };
    }

    try {
      const result = await this.primary.recall(input);
      this.cache.set(key, result);
      return result;
    } catch (error) {
      if (this.strictXTrace) {
        throw error;
      }
      const fallback = await this.fallback.recall(input);
      return {
        ...fallback,
        status: "FALLBACK",
        message: `XTrace unavailable; mock memory is running. ${error instanceof Error ? error.message : ""}`.trim(),
      };
    }
  }

  async ingest(input: MemoryIngestInput): Promise<MemoryIngestResult> {
    try {
      return await this.primary.ingest(input);
    } catch (error) {
      if (this.strictXTrace) {
        throw error;
      }
      const fallback = await this.fallback.ingest(input);
      return {
        ...fallback,
        status: "FALLBACK",
        message: `XTrace ingest unavailable; saved to mock session. ${error instanceof Error ? error.message : ""}`.trim(),
      };
    }
  }

  async getRecentMemories(input: RecentMemoryInput): Promise<RestaurantMemory[]> {
    return this.fallback.getRecentMemories(input);
  }

  async resetDemoState(input: ResetMemoryInput): Promise<void> {
    this.cache.clear();
    await this.fallback.resetDemoState?.(input);
  }
}

export function getMemoryProvider(): MemoryProvider {
  const mode = process.env.DEMO_MODE ?? "auto";
  const mock = new MockMemoryProvider();
  const hasXTrace = Boolean(process.env.XTRACE_API_KEY && process.env.XTRACE_ORG_ID);
  const groupId = process.env.XTRACE_GROUP_ID || `restaurant:${branchId}`;

  if (mode === "mock" || !hasXTrace) {
    return mock;
  }

  const xtrace = new XTraceMemoryProvider(process.env.XTRACE_API_KEY!, groupId);
  return new CachedMemoryProvider(xtrace, mock, mode === "xtrace");
}
