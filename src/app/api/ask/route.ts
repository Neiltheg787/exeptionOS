import { NextResponse } from "next/server";
import { getScenario, isScenarioId } from "@/data/scenarios";
import { runAgentFlow } from "@/lib/agents/run";
import { getDecisionEngine } from "@/lib/decision/engine";
import { getMemoryProvider } from "@/lib/memory/providers";

const branchId = "palo-alto-01";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { query?: string; scenarioId?: string };
    const scenarioId = isScenarioId(body.scenarioId) ? body.scenarioId! : "supplier-loop";
    const scenario = getScenario(scenarioId);
    const query = body.query?.trim() || scenario.suggestedQuestions[0]!;
    const memoryProvider = getMemoryProvider();
    const flow = await runAgentFlow({ query, branchId, scenarioId, memoryProvider });
    const engine = getDecisionEngine();
    const decision = await engine.enhance({
      scenario,
      query,
      memories: flow.decision.evidence,
      decision: flow.decision,
    });

    return NextResponse.json({
      query,
      scenario,
      routing: flow.routing,
      decision,
      provider: flow.provider,
      providerStatus: flow.providerStatus,
      health: {
        memoryProvider: flow.provider,
        decisionEngine:
          process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL ? "OPENAI" : "DETERMINISTIC",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "ASK_FAILED",
        message: error instanceof Error ? error.message : "Unable to process request.",
      },
      { status: 500 },
    );
  }
}
