import OpenAI from "openai";
import type { AggregatedDecision, DemoScenario, IntegrationStatus, RestaurantMemory } from "@/lib/types";

export interface DecisionEngine {
  enhance(input: {
    scenario: DemoScenario;
    query: string;
    memories: RestaurantMemory[];
    decision: AggregatedDecision;
  }): Promise<{ decision: AggregatedDecision; status: IntegrationStatus }>;
}

export class DeterministicDecisionEngine implements DecisionEngine {
  async enhance(input: {
    decision: AggregatedDecision;
  }): Promise<{ decision: AggregatedDecision; status: IntegrationStatus }> {
    return {
      decision: input.decision,
      status: {
        provider: "DETERMINISTIC",
        configured: false,
        ok: true,
        message: "OpenAI env vars are not fully configured; deterministic restaurant rules handled the decision.",
      },
    };
  }
}

export class OpenAIDecisionEngine implements DecisionEngine {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async enhance(input: {
    scenario: DemoScenario;
    query: string;
    memories: RestaurantMemory[];
    decision: AggregatedDecision;
  }): Promise<{ decision: AggregatedDecision; status: IntegrationStatus }> {
    try {
      const response = await this.client.responses.create({
        model: this.model,
        text: {
          format: {
            type: "json_schema",
            name: "restaurant_decision_enhancement",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                recommendation: {
                  type: "string",
                  description: "A concise manager-facing recommendation grounded only in supplied evidence.",
                },
                rationale: {
                  type: "string",
                  description: "Two to four sentences explaining evidence and safety constraints without chain of thought.",
                },
                playbookSteps: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 3,
                  maxItems: 5,
                },
              },
              required: ["recommendation", "rationale", "playbookSteps"],
            },
          },
        },
        input: [
          {
            role: "system",
            content:
              "You are EXCEPTION//OS, a restaurant operations decision engine. Use only the supplied deterministic recommendation and retrieved memory evidence. Do not invent facts, expose chain-of-thought, or claim software guarantees food safety. Keep the headline, risk, confidence, and manager approval requirements unchanged.",
          },
          {
            role: "user",
            content: JSON.stringify({
              query: input.query,
              scenario: input.scenario.id,
              headline: input.decision.headline,
              recommendation: input.decision.recommendation,
              rationale: input.decision.rationale,
              playbookSteps: input.decision.playbookSteps,
              evidence: input.memories.slice(0, 3).map((memory) => memory.content),
            }),
          },
        ],
        max_output_tokens: 320,
      });
      const text = response.output_text?.trim();
      if (!text) {
        return {
          decision: input.decision,
          status: {
            provider: "OPENAI",
            configured: true,
            ok: false,
            model: this.model,
            message: "OpenAI returned no text; deterministic decision was used.",
          },
        };
      }
      const parsed = JSON.parse(text) as {
        recommendation: string;
        rationale: string;
        playbookSteps: string[];
      };
      return {
        decision: {
          ...input.decision,
          recommendation: parsed.recommendation || input.decision.recommendation,
          rationale: parsed.rationale || input.decision.rationale,
          playbookSteps: parsed.playbookSteps?.length ? parsed.playbookSteps : input.decision.playbookSteps,
        },
        status: {
          provider: "OPENAI",
          configured: true,
          ok: true,
          model: this.model,
          message: `OpenAI Responses API completed with ${this.model}.`,
        },
      };
    } catch (error) {
      return {
        decision: input.decision,
        status: {
          provider: "OPENAI",
          configured: true,
          ok: false,
          model: this.model,
          message: `OpenAI unavailable; deterministic decision was used. ${error instanceof Error ? error.message : ""}`.trim(),
        },
      };
    }
  }
}

export function getDecisionEngine(): DecisionEngine {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) {
    return new OpenAIDecisionEngine(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL);
  }
  return new DeterministicDecisionEngine();
}

export async function getOpenAIHealth(): Promise<IntegrationStatus> {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
    return {
      provider: "OPENAI",
      configured: false,
      ok: false,
      message: "Set OPENAI_API_KEY and OPENAI_MODEL to enable live OpenAI decisions.",
    };
  }
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    await client.models.retrieve(process.env.OPENAI_MODEL);
    return {
      provider: "OPENAI",
      configured: true,
      ok: true,
      model: process.env.OPENAI_MODEL,
      message: `OpenAI model ${process.env.OPENAI_MODEL} is reachable.`,
    };
  } catch (error) {
    return {
      provider: "OPENAI",
      configured: true,
      ok: false,
      model: process.env.OPENAI_MODEL,
      message: error instanceof Error ? error.message : "OpenAI health check failed.",
    };
  }
}
