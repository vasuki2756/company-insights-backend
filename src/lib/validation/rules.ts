import type { ParamMeta, RuleFn, GlobalRuleFn } from "./types";

const PLACEHOLDERS = new Set(["not found", "n/a", "na", "unknown", "none", "tbd", "-"]);

const _URL = /^https?:\/\/[^\s]+$/i;
const _EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const _BULLET = /(^|\s)[•\-\*]\s|\d+\.\s/;

function isBlank(value: unknown): boolean {
  return String(value).trim() === "";
}

function split(value: unknown, meta: ParamMeta): string[] {
  const delim = meta.delimiter || ";";
  return String(value)
    .split(delim)
    .map((p) => p.trim())
    .filter((p) => p);
}

function values(value: unknown, meta: ParamMeta): string[] {
  if (meta.ac === "Composite") {
    return split(value, meta);
  }
  return [String(value).trim()];
}

// ─── Presence rules (apply to non-nullable params) ─────────────────────

export const not_blank: RuleFn = (value, _meta) => {
  return String(value).trim() ? null : "value is blank";
};

export const not_placeholder: RuleFn = (value, _meta) => {
  if (isBlank(value)) return null;
  return PLACEHOLDERS.has(String(value).trim().toLowerCase())
    ? `placeholder value: "${String(value)}"`
    : null;
};

// ─── Structural rules ─────────────────────────────────────────────────

export const atomic_no_delimiter: RuleFn = (value, _meta) => {
  if (isBlank(value)) return null;
  return String(value).includes(";")
    ? "atomic field contains ';' (should be a single value)"
    : null;
};

export const composite_min_count: RuleFn = (value, meta) => {
  if (isBlank(value)) return null;
  const n = split(value, meta).length;
  const lo = meta.minimum_element ?? 1;
  return n >= lo ? null : `composite needs >= ${lo} elements, got ${n}`;
};

export const composite_max_count: RuleFn = (value, meta) => {
  if (isBlank(value)) return null;
  const hi = meta.maximum_element;
  if (hi === null) return null;
  const n = split(value, meta).length;
  return n <= hi ? null : `composite allows <= ${hi} elements, got ${n}`;
};

export const composite_elements_nonempty: RuleFn = (value, meta) => {
  if (isBlank(value)) return null;
  const delim = meta.delimiter || ";";
  const parts = String(value).split(delim);
  return parts.some((p) => !p.trim()) ? "empty element between delimiters" : null;
};

export const composite_no_trailing_delimiter: RuleFn = (value, meta) => {
  if (isBlank(value)) return null;
  const delim = meta.delimiter || ";";
  return String(value).trimEnd().endsWith(delim) ? "trailing delimiter" : null;
};

export const composite_max_element_length: RuleFn = (value, meta) => {
  if (isBlank(value)) return null;
  const limit = 300;
  for (const v of split(value, meta)) {
    if (v.length > limit) {
      return `composite element exceeds ${limit} chars: "${v.slice(0, 40)}..."`;
    }
  }
  return null;
};

export const length_in_range: RuleFn = (value, meta) => {
  if (isBlank(value)) return null;
  const n = String(value).length;
  const lo = meta.min_length ?? 0;
  const hi = meta.max_length;
  if (n < lo) return `value too short (${n} < ${lo})`;
  if (hi !== null && n > hi) return `value too long (${n} > ${hi})`;
  return null;
};

// ─── Hygiene rules ────────────────────────────────────────────────────

export const no_newlines: RuleFn = (value, _meta) => {
  if (isBlank(value)) return null;
  return String(value).includes("\n") ? "contains a newline (cells must be single-line)" : null;
};

export const no_bullets: RuleFn = (value, _meta) => {
  if (isBlank(value)) return null;
  return _BULLET.test(String(value)) ? "contains a bullet/numbered-list marker" : null;
};

export const no_leading_trailing_space: RuleFn = (value, _meta) => {
  if (isBlank(value)) return null;
  const s = String(value);
  return s !== s.trim() ? "has leading/trailing whitespace" : null;
};

export const no_double_space: RuleFn = (value, _meta) => {
  if (isBlank(value)) return null;
  return String(value).includes("  ") ? "contains a double space" : null;
};

export const not_only_punctuation: RuleFn = (value, _meta) => {
  if (isBlank(value)) return null;
  return /[A-Za-z0-9]/.test(String(value)) ? null : "value has no alphanumeric content";
};

// ─── Typed shape rules (composite-aware) ──────────────────────────────

export const url_shape: RuleFn = (value, meta) => {
  if (isBlank(value)) return null;
  for (const v of values(value, meta)) {
    if (!_URL.test(v)) return `not a valid URL: "${v}"`;
  }
  return null;
};

export const email_shape: RuleFn = (value, meta) => {
  if (isBlank(value)) return null;
  for (const v of values(value, meta)) {
    if (!_EMAIL.test(v)) return `not a valid email: "${v}"`;
  }
  return null;
};

export const phone_shape: RuleFn = (value, meta) => {
  if (isBlank(value)) return null;
  for (const v of values(value, meta)) {
    const cleaned = v.replace(/\D/g, "");
    if (cleaned.length < 7) return `not a valid phone: "${v}"`;
  }
  return null;
};

export const number_shape: RuleFn = (value, meta) => {
  if (isBlank(value)) return null;
  for (const v of values(value, meta)) {
    if (!/\d/.test(v)) return `no numeric content: "${v}"`;
  }
  return null;
};

export const rating_range_0_10: RuleFn = (value, meta) => {
  if (isBlank(value)) return null;
  for (const v of values(value, meta)) {
    const m = /\d+(\.\d+)?/.exec(v);
    if (!m) return `no numeric rating: "${v}"`;
    const num = parseFloat(m[0]);
    if (num < 0 || num > 10) return `rating ${num} out of range 0-10`;
  }
  return null;
};

export const matches_pattern: RuleFn = (value, meta) => {
  const pattern = meta.regex_pattern;
  if (!pattern || isBlank(value)) return null;
  const rx = new RegExp(pattern);
  for (const v of values(value, meta)) {
    if (!rx.test(v)) return `"${v}" does not match pattern ${pattern}`;
  }
  return null;
};

export const enum_in_allowed: RuleFn = (value, meta) => {
  const allowed = (meta.allowed_values ?? []).map((a: string) => a.toLowerCase());
  if (allowed.length === 0 || isBlank(value)) return null;
  for (const v of values(value, meta)) {
    if (!allowed.includes(v.toLowerCase())) return `"${v}" not in allowed set`;
  }
  return null;
};

// ─── Global rules — operate on the WHOLE record ──────────────────────

const RESERVED_KEYS = new Set(["company_id", "_defects"]);

export const all_required_present: GlobalRuleFn = (record, metadata) => {
  const missing = metadata
    .filter((m) => !m.nullable && !String(record[m.column_name] ?? "").trim())
    .map((m) => m.column_name);
  return missing.length === 0 ? null : `missing required values: [${missing.join(", ")}]`;
};

export const all_163_present: GlobalRuleFn = (record, metadata) => {
  const missing = metadata.filter((m) => !(m.column_name in record)).map((m) => m.column_name);
  return missing.length === 0 ? null : `${missing.length} parameters missing keys: [${missing.slice(0, 5).join(", ")}]...`;
};

export const no_unexpected_keys: GlobalRuleFn = (record, metadata) => {
  const known = new Set([...metadata.map((m) => m.column_name), ...RESERVED_KEYS]);
  const extra = Object.keys(record).filter((k) => !known.has(k));
  return extra.length === 0 ? null : `unexpected keys in record: [${extra.join(", ")}]`;
};

// ─── Registries ──────────────────────────────────────────────────────

export const REGISTRY: Record<string, RuleFn> = {
  not_blank,
  not_placeholder,
  atomic_no_delimiter,
  composite_min_count,
  composite_max_count,
  composite_elements_nonempty,
  composite_no_trailing_delimiter,
  composite_max_element_length,
  length_in_range,
  no_newlines,
  no_bullets,
  no_leading_trailing_space,
  no_double_space,
  not_only_punctuation,
  url_shape,
  email_shape,
  phone_shape,
  number_shape,
  rating_range_0_10,
  matches_pattern,
  enum_in_allowed,
};

export const GLOBAL_REGISTRY: Record<string, GlobalRuleFn> = {
  all_required_present,
  all_163_present,
  no_unexpected_keys,
};
