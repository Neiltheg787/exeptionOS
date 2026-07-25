import OpenAI from "openai";
import type { AggregatedDecision, DemoScenario, RestaurantMemory } from "@/lib/types";

export interface DecisionEngine {
  enhance(input: {
    scenario: DemoScenario;
    query: string;
    memories: RestaurantMemory[];
    decision: AggregatedDecision;
  }): Promise<AggregatedDecision>;
}

export class DeterministicDecisionEngine implements DecisionEngine {
  async enhance(input: {
    decision: AggregatedDecision;
  }): Promise<AggregatedDecision> {
    return input.decision;
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
  }): Promise<AggregatedDecision> {
    try {
      const response = await this.client.responses.create({
        model: this.model,
        input: [
          {
            role: "system",
            content:
              "You are a restaurant operations decision editor. Improve only rationale wording. Do not add facts, do not reveal chain of thought, and keep safety limitations clear.",
          },
          {
            role: "user",
            content: JSON.stringify({
              query: input.query,
              headline: input.decision.headline,
              recommendation: input.decision.recommendation,
              rationale: input.decision.rationale,
              evidence: input.memories.slice(0, 3).map((memory) => memory.content),
            }),
          },
        ],
        max_output_tokens: 180,
      });
      const text = response.output_text?.trim();
      if (!text) return input.decision;
      return { ...input.decision, rationale: text };
    } catch {
      return input.decision;
    }
  }
}

export function getDecisionEngine(): DecisionEngine {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) {
    return new OpenAIDecisionEngine(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL);
  }
  return new DeterministicDecisionEngine();
}
