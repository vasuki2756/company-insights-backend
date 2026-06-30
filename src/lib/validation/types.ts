export interface ParamMeta {
  id: number;
  column_name: string;
  label: string;
  category: string;
  description: string;
  content_type: string;
  granularity: string;
  ac: "Atomic" | "Composite";
  minimum_element: number | null;
  maximum_element: number | null;
  min_length: number | null;
  max_length: number | null;
  data_type: string;
  validation_type: string;
  format_constraints: string;
  regex_pattern: string | null;
  nullability: string;
  nullable: boolean;
  delimiter: string | null;
  criticality: string;
  confidence_level: string;
  data_volatility: string;
  update_frequency: string;
  data_owner: string;
  business_rules: string;
  data_rules: string;
  data_source: string;
  validation_mode: string;
  is_derived_from: string;
  allowed_values: string[];
}

export interface MasterTestCase {
  id: string;
  applicable_to: "Per-Parameter" | "Specific-Parameters" | "Global";
  parameters: string[];
  applies_when: string;
  rule_id: string;
  test_case_category: string;
  test_case_type: string;
  priority: string;
  description: string;
  example_scenarios: string;
}

export type RuleFn = (value: unknown, meta: ParamMeta) => string | null;
export type GlobalRuleFn = (record: Record<string, unknown>, metadata: ParamMeta[]) => string | null;

export interface ValidationResult {
  ruleId: string;
  columnName: string;
  passed: boolean;
  error: string | null;
}
