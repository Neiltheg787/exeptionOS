import { NextResponse } from "next/server";
import { getOpenAIHealth } from "@/lib/decision/engine";
import { getXTraceHealth } from "@/lib/memory/providers";

export async function GET() {
  const [xtrace, openai] = await Promise.all([getXTraceHealth(), getOpenAIHealth()]);

  return NextResponse.json({
    xtrace,
    openai,
    ok: xtrace.ok && openai.ok,
  });
}
