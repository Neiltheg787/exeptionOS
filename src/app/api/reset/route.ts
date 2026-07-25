import { NextResponse } from "next/server";
import { isScenarioId } from "@/data/scenarios";
import { getMemoryProvider } from "@/lib/memory/providers";

const branchId = "palo-alto-01";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { scenarioId?: string };
    if (!isScenarioId(body.scenarioId)) {
      return NextResponse.json({ error: "INVALID_SCENARIO" }, { status: 400 });
    }
    await getMemoryProvider().resetDemoState?.({ branchId, scenarioId: body.scenarioId });
    return NextResponse.json({ ok: true, message: "Scenario reset complete." });
  } catch (error) {
    return NextResponse.json(
      {
        error: "RESET_FAILED",
        message: error instanceof Error ? error.message : "Unable to reset scenario.",
      },
      { status: 500 },
    );
  }
}
