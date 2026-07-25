import { NextResponse } from "next/server";
import { demoScenarios, isScenarioId } from "@/data/scenarios";
import { getXTraceProviderForAdmin } from "@/lib/memory/providers";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { scenarioId?: string; all?: boolean };
    const provider = getXTraceProviderForAdmin();
    if (!provider) {
      return NextResponse.json(
        {
          error: "XTRACE_NOT_CONFIGURED",
          message: "Set XTRACE_API_KEY before syncing demo memories to XTrace.",
        },
        { status: 400 },
      );
    }

    const scenarioIds = body.all
      ? demoScenarios.map((scenario) => scenario.id)
      : [isScenarioId(body.scenarioId) ? body.scenarioId! : "supplier-loop"];

    const results = [];
    for (const scenarioId of scenarioIds) {
      results.push({ scenarioId, ...(await provider.seedScenario(scenarioId)) });
    }

    return NextResponse.json({
      ok: true,
      results,
      message: "XTrace demo memory sync finished.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "SEED_FAILED",
        message: error instanceof Error ? error.message : "Unable to seed XTrace memories.",
      },
      { status: 500 },
    );
  }
}
