import pino from "pino";
import { render } from "../lib/prompts";
import { invoke, RESEARCH_PROVIDERS, invokeWithFallback } from "../lib/providers";

const logger = pino({ name: "research-service" });

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
] as const;

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

function buildDatasetTable(perProviderRows: Record<string, Record<string, string>[]>): string {
  const headers = "| ID | Category | A/C | Parameter | Research Output / Data | Source |";
  const sep = "|---|---|---|---|---|---|";
  const lines: string[] = [headers, sep];

  for (const [source, rows] of Object.entries(perProviderRows)) {
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

export async function runResearch(
  company: string,
  providerNames?: string[],
): Promise<Record<string, { raw: string; rows: Record<string, string>[] }>> {
  const providers = providerNames ?? RESEARCH_PROVIDERS;
  const prompt = render("research", { company });

  const perProvider: Record<string, { raw: string; rows: Record<string, string>[] }> = {};

  for (const name of providers) {
    logger.info({ provider: name }, "Research: querying provider");
    try {
      const text = await invoke(name, prompt);
      const rows = parseMarkdownTable(text);
      perProvider[name] = { raw: text, rows };
      logger.info({ provider: name, rowCount: rows.length }, "Research: parsed rows");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ provider: name, error: message }, "Research: provider failed, skipping");
      perProvider[name] = { raw: "", rows: [] };
    }
  }

  return perProvider;
}

export async function runConsolidation(
  company: string,
  perProviderRows: Record<string, Record<string, string>[]>,
  provider: string = "openrouter",
): Promise<Record<string, string>> {
  const dataset = buildDatasetTable(perProviderRows);
  const prompt = render("consolidation", { dataset });

  logger.info({ provider }, "Consolidation: querying provider");
  const text = await invokeWithFallback(provider, prompt, "groq");
  const rows = parseMarkdownTable(text);
  const record = rowsToRecord(rows);

  logger.info({ fieldCount: Object.keys(record).length }, "Consolidation: golden record complete");
  return record;
}

export async function runSkillMatrix(
  company: string,
  provider: string = "openrouter",
): Promise<Record<string, string>> {
  const prompt = render("expectation_matrix", { companies: company });

  logger.info({ provider }, "Skill matrix: querying provider");
  const text = await invokeWithFallback(provider, prompt, "groq");
  const rows = parseMarkdownTable(text);
  const row = rows[0] ?? {};

  logger.info({ columns: Object.keys(row).length }, "Skill matrix: complete");
  return row;
}

export async function runHiringAnalysis(
  company: string,
  provider: string = "openrouter",
): Promise<unknown> {
  const prompt = render("hiring", { company });

  logger.info({ provider }, "Hiring analysis: querying provider");
  const text = await invokeWithFallback(provider, prompt, "groq");
  const data = extractJson(text);

  logger.info({}, "Hiring analysis: complete");
  return data;
}

export interface PipelineResult {
  company: string;
  research: Record<string, { raw: string; rows: Record<string, string>[] }>;
  consolidation: Record<string, string>;
  skillMatrix: Record<string, string>;
  hiringAnalysis: unknown;
}

export async function runFullPipeline(
  company: string,
  providerNames?: string[],
  consolidationProvider?: string,
): Promise<PipelineResult> {
  logger.info({ company }, "Pipeline: starting full research pipeline");

  const perProvider = await runResearch(company, providerNames);
  const consolidation = await runConsolidation(company, Object.fromEntries(
    Object.entries(perProvider).map(([k, v]) => [k, v.rows]),
  ), consolidationProvider);
  const skillMatrix = await runSkillMatrix(company, consolidationProvider);
  const hiringAnalysis = await runHiringAnalysis(company, consolidationProvider);

  logger.info({ company }, "Pipeline: complete");

  return {
    company,
    research: perProvider,
    consolidation,
    skillMatrix,
    hiringAnalysis,
  };
}
