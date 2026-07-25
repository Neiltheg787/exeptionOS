export type Shift = "BREAKFAST" | "LUNCH" | "DINNER";

export type RestaurantCategory =
  | "SUPPLIER"
  | "INGREDIENT"
  | "EQUIPMENT"
  | "STAFFING"
  | "GUEST"
  | "RUSH";

export type RestaurantException = {
  id: string;
  occurredAt: string;
  shift: Shift;
  category: RestaurantCategory;
  severity: 1 | 2 | 3 | 4 | 5;
  situation: string;
  decision: string;
  reason: string;
  outcome: string;
  status: "OPEN" | "RESOLVED" | "MONITORING";
  tags: string[];
  metrics?: {
    complaints?: number;
    refunds?: number;
    revenueImpact?: number;
    ticketTimeMinutes?: number;
  };
};

export type AgentId =
  | "ORCHESTRATOR"
  | "SUPPLIER"
  | "EQUIPMENT"
  | "RUSH"
  | "ALLERGY"
  | "GUEST_RECOVERY"
  | "WASTE"
  | "SHIFT_BRIEFING"
  | "GROWTH";

export type MemoryType = "EPISODIC" | "SEMANTIC" | "PROCEDURAL" | "ARTIFACT";

export type RestaurantMemory = {
  id: string;
  scenarioId: string;
  memoryType: MemoryType;
  title: string;
  content: string;
  occurredAt?: string;
  category?: RestaurantCategory;
  agentIds?: AgentId[];
  entities: string[];
  tags: string[];
  outcome?: "SUCCESS" | "FAILURE" | "MONITORING";
  status?: "ACTIVE" | "RESOLVED" | "RETIRED";
  source: "XTRACE" | "MOCK" | "CACHE";
  similarityScore?: number;
};

export type ConfidenceSignal = {
  label: string;
  points: number;
  matched: boolean;
};

export type ProposedAction = {
  id: string;
  label: string;
  kind: "ACCEPT" | "OVERRIDE" | "LOG" | "SIMULATED";
  description: string;
};

export type DecisionRecommendation = {
  headline: string;
  recommendation: string;
  confidence: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  rationale: string;
  evidence: RestaurantException[];
  rejectedAction?: {
    action: string;
    reason: string;
  };
  playbookSteps: string[];
};

export type DemoScenario = {
  id: string;
  cartridgeNumber: string;
  title: string;
  codename: string;
  category: RestaurantCategory;
  description: string;
  alertHeadline: string;
  currentException: RestaurantException;
  historicalMemories: RestaurantMemory[];
  expectedRecommendation: DecisionRecommendation;
  confidenceSignals: ConfidenceSignal[];
  memoryTypes: MemoryType[];
  suggestedQuestions: string[];
};

export type AgentContext = {
  query: string;
  branchId: string;
  shift?: Shift;
  currentTime?: string;
  activeScenarioId?: string;
  currentIncident?: RestaurantException;
  recalledMemories: RestaurantMemory[];
};

export type AgentResult = {
  agentId: AgentId;
  role: "PRIMARY" | "SUPPORTING";
  dispatchReason: string;
  headline: string;
  recommendation: string;
  rationale: string;
  evidenceIds: string[];
  playbookSteps: string[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidenceSignals: ConfidenceSignal[];
  proposedActions: ProposedAction[];
  requiresHumanConfirmation: boolean;
};

export type AgentMemoryTrace = {
  agentId: AgentId;
  role: "PRIMARY" | "SUPPORTING";
  dispatchReason: string;
  memories: RestaurantMemory[];
};

export type RoutingDecision = {
  primaryAgent: AgentId;
  supportingAgents: AgentId[];
  detectedIntents: string[];
  detectedEntities: {
    ingredients?: string[];
    equipment?: string[];
    suppliers?: string[];
    menuItems?: string[];
    guestConcerns?: string[];
    events?: string[];
    timeConstraints?: string[];
  };
  routingConfidence: number;
  dispatchReasons: Array<{
    agentId: AgentId;
    reason: string;
  }>;
};

export type AggregatedDecision = {
  primaryAgent: AgentId;
  supportingAgents: AgentId[];
  headline: string;
  recommendation: string;
  rationale: string;
  evidence: RestaurantMemory[];
  playbookSteps: string[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: number;
  confidenceSignals: ConfidenceSignal[];
  proposedActions: ProposedAction[];
  requiresHumanConfirmation: boolean;
  conflictNotes?: string[];
};

export type MemoryRecallInput = {
  branchId: string;
  scenarioId: string;
  query: string;
  memoryQueries: string[];
  currentIncident?: RestaurantException;
};

export type MemoryRecallResult = {
  memories: RestaurantMemory[];
  provider: "XTRACE" | "MOCK" | "CACHE";
  status: "READY" | "FALLBACK" | "ERROR";
  message: string;
};

export type MemoryIngestInput = {
  branchId: string;
  scenarioId: string;
  query: string;
  managerAction: "ACCEPTED" | "OVERRIDDEN" | "LOGGED";
  outcomeStatus: "SUCCESS" | "FAILURE" | "MONITORING";
  note: string;
  decisionHeadline: string;
  agentIds: AgentId[];
};

export type MemoryIngestResult = {
  memory: RestaurantMemory;
  provider: "XTRACE" | "MOCK" | "CACHE";
  status: "SAVED" | "PROCESSING" | "FALLBACK";
  message: string;
};

export type RecentMemoryInput = {
  branchId: string;
  scenarioId?: string;
  limit?: number;
};

export type MemoryUsage = {
  provider: "XTRACE" | "MOCK" | "CACHE";
  recallCount: number;
  ingestCount: number;
};

export type ResetMemoryInput = {
  branchId: string;
  scenarioId: string;
};

export interface MemoryProvider {
  recall(input: MemoryRecallInput): Promise<MemoryRecallResult>;
  ingest(input: MemoryIngestInput): Promise<MemoryIngestResult>;
  getRecentMemories(input: RecentMemoryInput): Promise<RestaurantMemory[]>;
  getUsage?(): Promise<MemoryUsage>;
  resetDemoState?(input: ResetMemoryInput): Promise<void>;
}

export type IntegrationStatus = {
  provider: "XTRACE" | "MOCK" | "OPENAI" | "DETERMINISTIC";
  configured: boolean;
  ok: boolean;
  mode?: string;
  model?: string;
  message: string;
};

export interface SpecialistAgent {
  id: AgentId;
  displayName: string;
  description: string;
  priority: number;
  canHandle(input: {
    query: string;
    currentIncident?: RestaurantException;
  }): Promise<{ match: boolean; confidence: number; reason: string }>;
  buildMemoryQueries(context: AgentContext): string[];
  analyze(context: AgentContext): Promise<AgentResult>;
}
