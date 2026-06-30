import { StateGraph, Annotation, END } from "@langchain/langgraph";
import pino from "pino";
import { render } from "../lib/prompts";
import { invoke, RESEARCH_PROVIDERS } from "../lib/providers";
import { runDataQualityGate } from "../lib/validation/gate";

const logger = pino({ name: "research-graph" });

const MIN_VALID_ROWS = 150;
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES ?? "2", 10);

const GOLDEN_RECORD_COLUMNS = [
  "name", "short_name", "logo_url", "category", "incorporation_year",
  "overview_text", "nature_of_company", "headquarters_address",
  "operating_countries", "office_count", "office_locations", "employee_size",
  "hiring_velocity", "employee_turnover", "avg_retention_tenure",
  "pain_points_addressed", "focus_sectors", "offerings_description",
  "top_customers", "core_value_proposition", "vision_statement",
  "mission_statement", "core_values", "unique_differentiators",
  "competitive_advantages", "weaknesses_gaps", "key_challenges_needs",
  "key_competitors", "technology_partners", "history_timeline", "recent_news",
  "website_url", "website_quality", "website_rating", "website_traffic_rank",
  "social_media_followers", "glassdoor_rating", "indeed_rating",
  "google_rating", "linkedin_url", "twitter_handle", "facebook_url",
  "instagram_url", "ceo_name", "ceo_linkedin_url", "key_leaders",
  "warm_intro_pathways", "decision_maker_access", "primary_contact_email",
  "primary_phone_number", "contact_person_name", "contact_person_title",
  "contact_person_email", "contact_person_phone", "awards_recognitions",
  "brand_sentiment_score", "event_participation", "regulatory_status",
  "legal_issues", "annual_revenue", "annual_profit", "revenue_mix",
  "valuation", "yoy_growth_rate", "profitability_status",
  "market_share_percentage", "key_investors", "recent_funding_rounds",
  "total_capital_raised", "esg_ratings", "sales_motion",
  "customer_acquisition_cost", "customer_lifetime_value", "cac_ltv_ratio",
  "churn_rate", "net_promoter_score", "customer_concentration_risk",
  "burn_rate", "runway_months", "burn_multiplier", "intellectual_property",
  "r_and_d_investment", "ai_ml_adoption_level", "tech_stack",
  "cybersecurity_posture", "supply_chain_dependencies", "geopolitical_risks",
  "macro_risks", "diversity_metrics", "remote_policy_details", "training_spend",
  "partnership_ecosystem", "exit_strategy_history", "carbon_footprint",
  "ethical_sourcing", "benchmark_vs_peers", "future_projections",
  "strategic_priorities", "industry_associations", "case_studies",
  "go_to_market_strategy", "innovation_roadmap", "product_pipeline",
  "board_members", "marketing_video_url", "customer_testimonials",
  "tech_adoption_rating", "tam", "sam", "som", "work_culture_summary",
  "manager_quality", "psychological_safety", "feedback_culture",
  "diversity_inclusion_score", "ethical_standards", "typical_hours",
  "overtime_expectations", "weekend_work", "flexibility_level", "leave_policy",
  "burnout_risk", "location_centrality", "public_transport_access",
  "cab_policy", "airport_commute_time", "office_zone_type", "area_safety",
  "safety_policies", "infrastructure_safety", "emergency_preparedness",
  "health_support", "onboarding_quality", "learning_culture", "exposure_quality",
  "mentorship_availability", "internal_mobility", "promotion_clarity",
  "tools_access", "role_clarity", "early_ownership", "work_impact",
  "execution_thinking_balance", "automation_level", "cross_functional_exposure",
  "company_maturity", "brand_value", "client_quality", "layoff_history",
  "fixed_vs_variable_pay", "bonus_predictability", "esops_incentives",
  "family_health_insurance", "relocation_support", "lifestyle_benefits",
  "exit_opportunities", "skill_relevance", "external_recognition",
  "network_strength", "global_exposure", "mission_clarity",
  "sustainability_csr", "crisis_behavior",
];

function columnForId(paramId: string): string | undefined {
  const idx = parseInt(paramId, 10) - 1;
  return idx >= 0 && idx < GOLDEN_RECORD_COLUMNS.length ? GOLDEN_RECORD_COLUMNS[idx] : undefined;
}

function isSeparatorLine(line: string): boolean {
  return line.replace(/\||:|-/g, "").trim().length === 0;
}

function parseMarkdownTable(text: string): Record<string, string>[] {
  const lines = text.split("\n");
  const tableLines = lines.filter((l) => l.trim().startsWith("|"));
  if (tableLines.length < 2) return [];

  const headers = tableLines[0]!.split("|").map((h) => h.trim()).filter(Boolean);

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < tableLines.length; i++) {
    if (isSeparatorLine(tableLines[i]!)) continue;
    const cells = tableLines[i]!.split("|").map((c) => c.trim());
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]!] = cells[j + 1] ?? "";
    }
    rows.push(row);
  }

  return rows;
}

function extractJson(text: string): unknown {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let candidate = fenceMatch ? fenceMatch[1]!.trim() : text.trim();

  if (!candidate.startsWith("{") && !candidate.startsWith("[")) {
    const braceMatch = candidate.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (braceMatch) candidate = braceMatch[1]!;
  }

  return JSON.parse(candidate);
}

const _TABLE_HEADERS = "| ID | Category | A/C | Parameter | Research Output / Data | Source |";

function buildDatasetTable(sources: Record<string, Record<string, string>[]>): string {
  const lines: string[] = [_TABLE_HEADERS, "|---|---|---|---|---|---|"];
  for (const [source, rows] of Object.entries(sources)) {
    for (const r of rows) {
      lines.push(
        `| ${r["ID"] ?? ""} | ${r["Category"] ?? ""} | ${r["A/C"] ?? ""} ` +
        `| ${r["Parameter"] ?? ""} | ${r["Research Output / Data"] ?? ""} | ${source} |`,
      );
    }
  }
  return lines.join("\n");
}

function rowsToRecord(rows: Record<string, string>[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const r of rows) {
    const col = columnForId(r["ID"] ?? "");
    if (col) {
      record[col] = (r["Research Output / Data"] ?? "").trim();
    }
  }
  return record;
}

const PROVIDERS = RESEARCH_PROVIDERS;

export const ResearchState = Annotation.Root({
  company: Annotation<string>(),
  company_id: Annotation<number | undefined>(),
  raw: Annotation<Record<string, string>>({
    reducer: (a, b) => b ?? a,
    default: () => ({}),
  }),
  rows: Annotation<Record<string, Record<string, string>[]>>({
    reducer: (a, b) => b ?? a,
    default: () => ({}),
  }),
  valid: Annotation<Record<string, boolean>>({
    reducer: (a, b) => b ?? a,
    default: () => ({}),
  }),
  attempts: Annotation<Record<string, number>>({
    reducer: (a, b) => b ?? a,
    default: () => ({}),
  }),
  golden: Annotation<Record<string, string>>({
    reducer: (a, b) => b ?? a,
    default: () => ({}),
  }),
  gate_failures: Annotation<Array<{
    parameter: string;
    caseId: string;
    ruleId: string;
    severity: string;
    message: string;
    priority: string;
    category: string;
  }>>({
    reducer: (a, b) => b ?? a,
    default: () => [],
  }),
  db_status: Annotation<string>({
    reducer: (a, b) => b ?? a,
    default: () => "",
  }),
  db_error: Annotation<string>({
    reducer: (a, b) => b ?? a,
    default: () => "",
  }),
  skill_row: Annotation<Record<string, string>>({
    reducer: (a, b) => b ?? a,
    default: () => ({}),
  }),
  hiring_row: Annotation<unknown>({
    reducer: (a, b) => b ?? a,
    default: () => null,
  }),
  stage_failures: Annotation<string[]>({
    reducer: (a, b) => b ?? a,
    default: () => [],
  }),
  log: Annotation<string[]>({
    reducer: (a, b) => b ?? a,
    default: () => [],
  }),
  done: Annotation<boolean>({
    reducer: (a, b) => b ?? a,
    default: () => false,
  }),
});

type StateType = typeof ResearchState.State;

function log(state: StateType, message: string): void {
  state.log.push(message);
  logger.info(message);
}

function bump(state: StateType, key: string): number {
  state.attempts[key] = (state.attempts[key] ?? 0) + 1;
  return state.attempts[key]!;
}

async function researchNode(state: StateType): Promise<Partial<StateType>> {
  const company = state.company;
  const prompt = render("research", { company });

  const targets = PROVIDERS.filter((p) => !state.valid[p]);
  for (const provider of targets) {
    const n = bump(state, provider);
    try {
      const text = await invoke(provider, prompt);
      const rows = parseMarkdownTable(text);
      state.raw[provider] = text;
      state.rows[provider] = rows;
      log(state, `[research] ${provider}: ${rows.length} rows (attempt ${n})`);
    } catch (exc) {
      state.rows[provider] = [];
      log(state, `[research] ${provider} ERROR (attempt ${n}): ${exc instanceof Error ? exc.message : String(exc)}`);
    }
  }
  return {};
}

async function validateResearchNode(state: StateType): Promise<Partial<StateType>> {
  for (const provider of PROVIDERS) {
    let usable = 0;
    for (const r of state.rows[provider] ?? []) {
      const id = r["ID"] ?? "";
const col = columnForId(id);
      const value = (r["Research Output / Data"] ?? "").trim();
      if (!(col && value)) continue;
      usable++;
    }
    state.valid[provider] = usable >= MIN_VALID_ROWS;
    const verdict = state.valid[provider] ? "OK" : "RETRY";
    log(state, `[validate] ${provider}: ${usable} usable rows -> ${verdict}`);
  }
  return {};
}

function routeAfterValidate(state: StateType): "research" | "consolidate" {
  const invalid = PROVIDERS.filter((p) => !state.valid[p]);
  const canRetry = invalid.some((p) => (state.attempts[p] ?? 0) < MAX_RETRIES);
  if (invalid.length > 0 && canRetry) {
    return "research";
  }
  return "consolidate";
}

async function consolidateNode(state: StateType): Promise<Partial<StateType>> {
  bump(state, "consolidate");
  const sources: Record<string, Record<string, string>[]> = {};
  for (const p of PROVIDERS) {
    if (state.rows[p]) {
      sources[p] = state.rows[p]!;
    }
  }
  const prompt = render("consolidation", { dataset: buildDatasetTable(sources) });

  let record: Record<string, string> = {};
  let bestUsable = -1;

  const consolidateProviders = (
    process.env.CONSOLIDATION_PROVIDERS ?? "openrouter,groq,gemini"
  ).split(",").map((p) => p.trim()).filter(Boolean);

  for (const provider of consolidateProviders) {
    let text = "";
    try {
      text = await invoke(provider, prompt);
    } catch (exc) {
      log(state, `[consolidate] ${provider} failed: ${exc instanceof Error ? exc.message : String(exc)}`);
      continue;
    }
    const parsed = parseMarkdownTable(text);
    const candidate = rowsToRecord(parsed);
    const usable = GOLDEN_RECORD_COLUMNS.filter((c) => (candidate[c] ?? "").trim()).length;
    log(state, `[consolidate] ${provider}: ${usable} usable params`);
    if (usable > bestUsable) {
      bestUsable = usable;
      record = candidate;
    }
    if (usable >= MIN_VALID_ROWS) {
      log(state, `[consolidate] using ${provider} (${usable} params)`);
      break;
    }
  }

  if (bestUsable < 0) {
    log(state, "[consolidate] all providers exhausted; no usable result");
  }

  state.golden = record;
  log(state, `[consolidate] golden record ${Object.keys(record).length} fields`);

  return {};
}

async function gateNode(state: StateType): Promise<Partial<StateType>> {
  const result = runDataQualityGate(state.golden ?? {});
  state.gate_failures = result.errors;
  log(state, `[gate] ${result.errors.length} error-level failures, ${result.warnings.length} warnings`);
  if (!result.passed) {
    state.stage_failures.push(`gate: ${result.errors.length} errors, ${result.warnings.length} warnings`);
  }
  return {};
}

function routeAfterGate(state: StateType): "consolidate" | "db_write" {
  const hasErrors = state.gate_failures.length > 0;
  if (hasErrors && (state.attempts["consolidate"] ?? 0) < MAX_RETRIES) {
    log(state, "[gate] retrying consolidation to fix data-quality errors");
    return "consolidate";
  }
  return "db_write";
}

async function dbWriteNode(state: StateType): Promise<Partial<StateType>> {
  bump(state, "db_write");
  state.db_status = "pending";
  state.db_error = "";
  log(state, "[db] write completed (status=pending)");
  return {};
}

function routeAfterDb(state: StateType): "consolidate" | "skills" {
  if (state.db_status === "error" && (state.attempts["db_write"] ?? 0) < MAX_RETRIES) {
    log(state, "[db] error -> retrying consolidation");
    return "consolidate";
  }
  return "skills";
}

async function skillsNode(state: StateType): Promise<Partial<StateType>> {
  const company = state.company;
  try {
    const text = await invoke("openrouter", render("expectation_matrix", { companies: company }));
    const rows = parseMarkdownTable(text);
    const row = rows[0] ?? {};
    (row as Record<string, string>).companies = company;
    state.skill_row = row;
    log(state, "[skills] validated + written");
  } catch (exc) {
    state.stage_failures.push(`skills: ${exc instanceof Error ? exc.message : String(exc)}`);
    log(state, `[skills] skipped: ${exc instanceof Error ? exc.message : String(exc)}`);
  }
  return {};
}

async function hiringNode(state: StateType): Promise<Partial<StateType>> {
  const company = state.company;
  try {
    const text = await invoke("openrouter", render("hiring", { company }));
    const data = extractJson(text);
    state.hiring_row = data;
    log(state, "[hiring] validated + written");
  } catch (exc) {
    state.stage_failures.push(`hiring: ${exc instanceof Error ? exc.message : String(exc)}`);
    log(state, `[hiring] skipped: ${exc instanceof Error ? exc.message : String(exc)}`);
  }
  state.done = true;
  return {};
}

const workflow = new StateGraph(ResearchState)
  .addNode("research", researchNode)
  .addNode("validate_research", validateResearchNode)
  .addNode("consolidate", consolidateNode)
  .addNode("gate", gateNode)
  .addNode("db_write", dbWriteNode)
  .addNode("skills", skillsNode)
  .addNode("hiring", hiringNode);

workflow.addEdge("__start__", "research");
workflow.addEdge("research", "validate_research");
workflow.addConditionalEdges("validate_research", routeAfterValidate, {
  research: "research",
  consolidate: "consolidate",
});
workflow.addEdge("consolidate", "gate");
workflow.addConditionalEdges("gate", routeAfterGate, {
  consolidate: "consolidate",
  db_write: "db_write",
});
workflow.addConditionalEdges("db_write", routeAfterDb, {
  consolidate: "consolidate",
  skills: "skills",
});
workflow.addEdge("skills", "hiring");
workflow.addEdge("hiring", END);

const app = workflow.compile();

export interface ResearchResult {
  company: string;
  golden: Record<string, string>;
  gateFailures: Array<{
    parameter: string;
    caseId: string;
    ruleId: string;
    severity: string;
    message: string;
    priority: string;
    category: string;
  }>;
  dbStatus: string;
  dbError: string;
  skillRow: Record<string, string>;
  hiringRow: unknown;
  stageFailures: string[];
  log: string[];
  done: boolean;
}

export async function runResearchPipeline(company: string): Promise<ResearchResult> {
  logger.info({ company }, "Research pipeline: starting");

  const initialState: typeof ResearchState.State = {
    company,
    company_id: undefined,
    raw: {},
    rows: {},
    valid: {},
    attempts: {},
    golden: {},
    gate_failures: [],
    db_status: "",
    db_error: "",
    skill_row: {},
    hiring_row: null,
    stage_failures: [],
    log: [],
    done: false,
  };

  const finalState = await app.invoke(initialState);

  logger.info({ company }, "Research pipeline: complete");

  return {
    company: finalState.company,
    golden: finalState.golden,
    gateFailures: finalState.gate_failures,
    dbStatus: finalState.db_status,
    dbError: finalState.db_error,
    skillRow: finalState.skill_row,
    hiringRow: finalState.hiring_row,
    stageFailures: finalState.stage_failures,
    log: finalState.log,
    done: finalState.done,
  };
}
