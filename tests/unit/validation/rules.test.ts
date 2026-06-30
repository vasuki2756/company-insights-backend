import { describe, it, expect } from "vitest";
import {
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
  all_required_present,
  all_163_present,
  no_unexpected_keys,
  REGISTRY,
  GLOBAL_REGISTRY,
} from "../../../src/lib/validation/rules";
import type { ParamMeta } from "../../../src/lib/validation/types";

function meta(overrides: Partial<ParamMeta> = {}): ParamMeta {
  return {
    id: 1,
    column_name: "test_field",
    label: "",
    category: "",
    description: "",
    content_type: "",
    granularity: "",
    ac: "Atomic",
    minimum_element: null,
    maximum_element: null,
    min_length: null,
    max_length: null,
    data_type: "VARCHAR(255)",
    validation_type: "text",
    format_constraints: "",
    regex_pattern: null,
    nullability: "Not Null",
    nullable: false,
    delimiter: null,
    criticality: "",
    confidence_level: "",
    data_volatility: "",
    update_frequency: "",
    data_owner: "",
    business_rules: "",
    data_rules: "",
    data_source: "",
    validation_mode: "",
    is_derived_from: "",
    allowed_values: [],
    ...overrides,
  };
}

// ─── Presence rules ──────────────────────────────────────────────────

describe("not_blank", () => {
  it("returns null for non-blank value", () => {
    expect(not_blank("hello", meta())).toBeNull();
  });

  it("returns error for empty string", () => {
    expect(not_blank("", meta())).toBe("value is blank");
  });

  it("returns error for whitespace-only", () => {
    expect(not_blank("   ", meta())).toBe("value is blank");
  });
});

describe("not_placeholder", () => {
  it("returns null for normal value", () => {
    expect(not_placeholder("Acme Corp", meta())).toBeNull();
  });

  it("detects 'N/A' as placeholder", () => {
    expect(not_placeholder("N/A", meta())).toMatch(/placeholder/);
  });

  it("detects 'unknown' case-insensitively", () => {
    expect(not_placeholder("Unknown", meta())).toMatch(/placeholder/);
  });

  it("returns null for blank value (skip)", () => {
    expect(not_placeholder("", meta())).toBeNull();
  });
});

// ─── Structural rules ────────────────────────────────────────────────

describe("atomic_no_delimiter", () => {
  it("passes for plain atomic value", () => {
    expect(atomic_no_delimiter("Public", meta())).toBeNull();
  });

  it("fails when semicolon is present", () => {
    expect(atomic_no_delimiter("Public; Private", meta())).toMatch(/contains ';'/);
  });

  it("returns null for blank value", () => {
    expect(atomic_no_delimiter("", meta())).toBeNull();
  });
});

describe("composite_min_count", () => {
  const m = meta({ ac: "Composite", minimum_element: 3, delimiter: ";" });

  it("passes when count >= minimum_element", () => {
    expect(composite_min_count("A; B; C", m)).toBeNull();
  });

  it("fails when count < minimum_element", () => {
    expect(composite_min_count("A; B", m)).toMatch(/needs >= 3/);
  });

  it("defaults minimum_element to 1 when null", () => {
    expect(composite_min_count("A", meta({ ac: "Composite" }))).toBeNull();
  });
});

describe("composite_max_count", () => {
  const m = meta({ ac: "Composite", maximum_element: 2, delimiter: ";" });

  it("passes when count <= maximum_element", () => {
    expect(composite_max_count("A; B", m)).toBeNull();
  });

  it("fails when count > maximum_element", () => {
    expect(composite_max_count("A; B; C", m)).toMatch(/allows <= 2/);
  });

  it("returns null when maximum_element is not set", () => {
    expect(composite_max_count("A; B; C", meta({ ac: "Composite" }))).toBeNull();
  });
});

describe("composite_elements_nonempty", () => {
  const m = meta({ ac: "Composite", delimiter: ";" });

  it("passes when all elements are non-empty", () => {
    expect(composite_elements_nonempty("A; B; C", m)).toBeNull();
  });

  it("fails when an element is empty", () => {
    expect(composite_elements_nonempty("A; ; C", m)).toMatch(/empty element/);
  });
});

describe("composite_no_trailing_delimiter", () => {
  const m = meta({ ac: "Composite", delimiter: ";" });

  it("passes without trailing delimiter", () => {
    expect(composite_no_trailing_delimiter("A; B; C", m)).toBeNull();
  });

  it("fails with trailing delimiter", () => {
    expect(composite_no_trailing_delimiter("A; B; C;", m)).toMatch(/trailing delimiter/);
  });
});

describe("composite_max_element_length", () => {
  const m = meta({ ac: "Composite", delimiter: ";" });
  const long = "x".repeat(301);

  it("passes when elements are within limit", () => {
    expect(composite_max_element_length("short; elements", m)).toBeNull();
  });

  it("fails when an element exceeds 300 chars", () => {
    expect(composite_max_element_length(`short; ${long}; end`, m)).toMatch(/exceeds 300/);
  });
});

describe("length_in_range", () => {
  it("passes when length is within bounds", () => {
    expect(length_in_range("Hello", meta({ min_length: 2, max_length: 100 }))).toBeNull();
  });

  it("fails when too short", () => {
    expect(length_in_range("X", meta({ min_length: 2 }))).toMatch(/too short/);
  });

  it("fails when too long", () => {
    expect(length_in_range("X".repeat(256), meta({ max_length: 255 }))).toMatch(/too long/);
  });

  it("returns null for blank", () => {
    expect(length_in_range("", meta())).toBeNull();
  });
});

// ─── Hygiene rules ───────────────────────────────────────────────────

describe("no_newlines", () => {
  it("passes for single-line value", () => {
    expect(no_newlines("single line", meta())).toBeNull();
  });

  it("fails for multi-line value", () => {
    expect(no_newlines("line1\nline2", meta())).toMatch(/newline/);
  });
});

describe("no_bullets", () => {
  it("passes for plain text", () => {
    expect(no_bullets("normal text", meta())).toBeNull();
  });

  it("detects bullet marker", () => {
    expect(no_bullets("- first item", meta())).toMatch(/bullet/);
  });

  it("detects numbered list", () => {
    expect(no_bullets("1. first", meta())).toMatch(/bullet/);
  });
});

describe("no_leading_trailing_space", () => {
  it("passes for trimmed value", () => {
    expect(no_leading_trailing_space("hello", meta())).toBeNull();
  });

  it("fails for leading space", () => {
    expect(no_leading_trailing_space(" hello", meta())).toMatch(/whitespace/);
  });

  it("fails for trailing space", () => {
    expect(no_leading_trailing_space("hello ", meta())).toMatch(/whitespace/);
  });
});

describe("no_double_space", () => {
  it("passes for single spaces", () => {
    expect(no_double_space("hello world", meta())).toBeNull();
  });

  it("fails for double space", () => {
    expect(no_double_space("hello  world", meta())).toMatch(/double space/);
  });
});

describe("not_only_punctuation", () => {
  it("passes for alphanumeric value", () => {
    expect(not_only_punctuation("60%", meta())).toBeNull();
  });

  it("fails for punctuation-only value", () => {
    expect(not_only_punctuation("--;--", meta())).toMatch(/no alphanumeric/);
  });
});

// ─── Typed shape rules ───────────────────────────────────────────────

describe("url_shape", () => {
  it("passes for valid HTTPS URL", () => {
    expect(url_shape("https://www.acme.com", meta())).toBeNull();
  });

  it("fails for plain text", () => {
    expect(url_shape("acme dot com", meta())).toMatch(/not a valid URL/);
  });
});

describe("email_shape", () => {
  it("passes for valid email", () => {
    expect(email_shape("user@example.com", meta())).toBeNull();
  });

  it("fails for invalid email", () => {
    expect(email_shape("not-an-email", meta())).toMatch(/not a valid email/);
  });
});

describe("phone_shape", () => {
  it("passes for valid phone with 7+ digits", () => {
    expect(phone_shape("+1 555 123 4567", meta())).toBeNull();
  });

  it("fails for text with insufficient digits", () => {
    expect(phone_shape("call us", meta())).toMatch(/not a valid phone/);
  });
});

describe("number_shape", () => {
  it("passes for numeric content", () => {
    expect(number_shape("15000000", meta())).toBeNull();
  });

  it("fails for text with no digits", () => {
    expect(number_shape("many", meta())).toMatch(/no numeric content/);
  });
});

describe("rating_range_0_10", () => {
  it("passes for rating within range", () => {
    expect(rating_range_0_10("4.2", meta())).toBeNull();
  });

  it("fails for rating out of range", () => {
    expect(rating_range_0_10("55", meta())).toMatch(/out of range/);
  });

  it("fails for non-numeric rating", () => {
    expect(rating_range_0_10("great", meta())).toMatch(/no numeric rating/);
  });
});

describe("matches_pattern", () => {
  it("passes when value matches pattern", () => {
    expect(matches_pattern("hello123", meta({ regex_pattern: "^[a-z0-9]+$" }))).toBeNull();
  });

  it("fails when value does not match pattern", () => {
    expect(matches_pattern("Hello!", meta({ regex_pattern: "^[a-z]+$" }))).toMatch(/does not match/);
  });

  it("returns null when no pattern is set", () => {
    expect(matches_pattern("anything", meta())).toBeNull();
  });
});

describe("enum_in_allowed", () => {
  const m = meta({ allowed_values: ["Public", "Private", "Nonprofit"] });

  it("passes for allowed value", () => {
    expect(enum_in_allowed("Public", m)).toBeNull();
  });

  it("fails for disallowed value", () => {
    expect(enum_in_allowed("Government", m)).toMatch(/not in allowed set/);
  });

  it("is case-insensitive", () => {
    expect(enum_in_allowed("public", m)).toBeNull();
  });
});

// ─── Global rules ───────────────────────────────────────────────────

describe("all_required_present", () => {
  it("passes when all non-nullable fields have values", () => {
    const metaList = [
      meta({ column_name: "name", nullable: false }),
      meta({ column_name: "email", nullable: false }),
    ];
    expect(all_required_present({ name: "Acme", email: "a@b.com" }, metaList)).toBeNull();
  });

  it("fails when a required field is missing", () => {
    const metaList = [
      meta({ column_name: "name", nullable: false }),
    ];
    expect(all_required_present({ name: "" }, metaList)).toMatch(/missing required/);
  });
});

describe("all_163_present", () => {
  it("passes when all metadata keys are present in record", () => {
    const metaList = [meta({ column_name: "name" }), meta({ column_name: "email" })];
    expect(all_163_present({ name: "x", email: "y" }, metaList)).toBeNull();
  });

  it("fails when a key is missing", () => {
    const metaList = [meta({ column_name: "name" }), meta({ column_name: "email" })];
    const result = all_163_present({ name: "x" }, metaList);
    expect(result).toMatch(/missing/);
    expect(result).toMatch(/email/);
  });
});

describe("no_unexpected_keys", () => {
  it("passes when record has only known keys", () => {
    const metaList = [meta({ column_name: "name" })];
    expect(no_unexpected_keys({ name: "x", company_id: 1 }, metaList)).toBeNull();
  });

  it("fails when record has unknown keys", () => {
    const metaList = [meta({ column_name: "name" })];
    expect(no_unexpected_keys({ name: "x", notes: "secret" }, metaList)).toMatch(/unexpected keys/);
  });
});

// ─── Registry completeness ──────────────────────────────────────────

describe("REGISTRY", () => {
  it("has all 21 per-value rules", () => {
    const expected = [
      "not_blank", "not_placeholder",
      "atomic_no_delimiter", "composite_min_count", "composite_max_count",
      "composite_elements_nonempty", "composite_no_trailing_delimiter", "composite_max_element_length",
      "length_in_range",
      "no_newlines", "no_bullets", "no_leading_trailing_space", "no_double_space", "not_only_punctuation",
      "url_shape", "email_shape", "phone_shape", "number_shape", "rating_range_0_10",
      "matches_pattern", "enum_in_allowed",
    ];
    for (const name of expected) {
      expect(REGISTRY[name]).toBeDefined();
    }
    expect(Object.keys(REGISTRY)).toHaveLength(21);
  });
});

describe("GLOBAL_REGISTRY", () => {
  it("has all 3 global rules", () => {
    expect(GLOBAL_REGISTRY.all_required_present).toBeDefined();
    expect(GLOBAL_REGISTRY.all_163_present).toBeDefined();
    expect(GLOBAL_REGISTRY.no_unexpected_keys).toBeDefined();
  });
});
