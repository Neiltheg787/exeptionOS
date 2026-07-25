import { NextResponse } from "next/server";
import { isScenarioId } from "@/data/scenarios";
import { getMemoryProvider } from "@/lib/memory/providers";
import type { AgentId } from "@/lib/types";

const branchId = "palo-alto-01";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      scenarioId?: string;
      query?: string;
      managerAction?: "ACCEPTED" | "OVERRIDDEN" | "LOGGED";
      outcomeStatus?: "SUCCESS" | "FAILURE" | "MONITORING";
      note?: string;
      decisionHeadline?: string;
      agentIds?: AgentId[];
    };

    if (!isScenarioId(body.scenarioId)) {
      return NextResponse.json({ error: "INVALID_SCENARIO" }, { status: 400 });
    }

    const result = await getMemoryProvider().ingest({
      branchId,
      scenarioId: body.scenarioId,
      query: body.query ?? "",
      managerAction: body.managerAction ?? "LOGGED",
      outcomeStatus: body.outcomeStatus ?? "MONITORING",
      note: body.note?.trim() || "Manager logged outcome during demo.",
      decisionHeadline: body.decisionHeadline ?? "Outcome added",
      agentIds: body.agentIds?.length ? body.agentIds : ["ORCHESTRATOR"],
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "OUTCOME_FAILED",
        message: error instanceof Error ? error.message : "Unable to save outcome.",
      },
      { status: 500 },
    );
  }
}
