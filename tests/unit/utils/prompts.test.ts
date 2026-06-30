import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  buildRagPrompt,
  buildCompanyQuestionPrompt,
  buildSkillGapPrompt,
  buildInterviewPrepPrompt,
  buildContextFromResults,
} from "../../../src/utils/prompts";

describe("buildSystemPrompt", () => {
  it("returns a string with the KITS AI persona", () => {
    const result = buildSystemPrompt();
    expect(typeof result).toBe("string");
    expect(result).toContain("KITS AI");
    expect(result).toContain("Karunya Institute");
  });

  it("includes guidelines about using provided context", () => {
    const result = buildSystemPrompt();
    expect(result).toMatch(/be concise|don't have enough context|never fabricate/i);
  });

  it("mentions placement preparation", () => {
    const result = buildSystemPrompt();
    expect(result).toMatch(/placement|interview|career/i);
  });
});

describe("buildRagPrompt", () => {
  it("includes query, context, and history", () => {
    const result = buildRagPrompt("What is Google?", "Google context here", "Previous chat");
    expect(result).toContain("What is Google?");
    expect(result).toContain("Google context here");
    expect(result).toContain("Previous chat");
  });

  it("instructs to use the provided context", () => {
    const result = buildRagPrompt("q", "c", "h");
    expect(result).toMatch(/based ONLY on the context/i);
  });

  it("mentions company names and section types as sources", () => {
    const result = buildRagPrompt("q", "c", "h");
    expect(result).toMatch(/company|section/i);
  });
});

describe("buildCompanyQuestionPrompt", () => {
  const companyName = "Acme Corp";
  const question = "What tech stack do they use?";
  const profile = "Overview: Acme is a fintech startup.\nTech: Python, React";

  it("includes company name, question, and profile", () => {
    const result = buildCompanyQuestionPrompt(companyName, question, profile);
    expect(result).toContain("Acme Corp");
    expect(result).toContain("What tech stack do they use?");
    expect(result).toContain("Overview: Acme is a fintech startup.");
  });

  it("says when information is not available", () => {
    const result = buildCompanyQuestionPrompt(companyName, question, profile);
    expect(result).toMatch(/not available|don't make up/i);
  });
});

describe("buildSkillGapPrompt", () => {
  const studentSkills = "Python: Level 3\nSQL: Level 2";
  const requirements = "Python: Level 4\nSQL: Level 3\nDocker: Level 2";
  const companyName = "TechCorp";

  it("includes student skills, requirements, and company name", () => {
    const result = buildSkillGapPrompt(studentSkills, requirements, companyName);
    expect(result).toContain("Python: Level 3");
    expect(result).toContain("Python: Level 4");
    expect(result).toContain("TechCorp");
  });

  it("asks for gap calculation and recommendations", () => {
    const result = buildSkillGapPrompt(studentSkills, requirements, companyName);
    expect(result).toMatch(/numeric gap|required.*current/i);
    expect(result).toMatch(/recommendation|closing each gap|courses/i);
  });

  it("requests top 3 critical skills", () => {
    const result = buildSkillGapPrompt(studentSkills, requirements, companyName);
    expect(result).toMatch(/top 3|most critical/i);
  });
});

describe("buildInterviewPrepPrompt", () => {
  it("includes company info and tech stack", () => {
    const result = buildInterviewPrepPrompt(
      "Google",
      ["Python", "Go", "TensorFlow"],
      "Google is a search engine",
      5,
    );
    expect(result).toContain("Google");
    expect(result).toContain("Python");
    expect(result).toContain("Go");
    expect(result).toContain("TensorFlow");
    expect(result).toContain("Google is a search engine");
  });

  it("requests specified number of questions", () => {
    const result = buildInterviewPrepPrompt("Google", ["Python"], "desc", 5);
    expect(result).toContain("5 interview preparation questions");
  });

  it("includes technical, behavioral, and company-specific categories", () => {
    const result = buildInterviewPrepPrompt("Google", ["Python"], "desc", 3);
    expect(result).toMatch(/technical/i);
    expect(result).toMatch(/behavioral/i);
    expect(result).toMatch(/company-specific/i);
  });

  it("asks for progressively harder questions", () => {
    const result = buildInterviewPrepPrompt("Google", ["Python"], "desc", 3);
    expect(result).toMatch(/easy|medium|hard|progressively harder/i);
  });

  it("handles empty tech stack gracefully", () => {
    const result = buildInterviewPrepPrompt("Google", [], "desc", 3);
    expect(result).not.toContain("undefined");
    expect(result).not.toContain("null");
  });
});

describe("buildContextFromResults", () => {
  const results = [
    { companyName: "Google", sectionType: "overview", content: "Google is a search engine company." },
    { companyName: "Meta", sectionType: "culture", content: "Meta focuses on social media." },
    { companyName: "Apple", sectionType: "tech_stack", content: "Apple uses Swift and Objective-C." },
  ];

  it("formats results with company name, section, and content", () => {
    const result = buildContextFromResults(results, 5000);
    expect(result).toContain("Company: Google");
    expect(result).toContain("Section: overview");
    expect(result).toContain("Google is a search engine company.");
    expect(result).toContain("Company: Meta");
    expect(result).toContain("Company: Apple");
  });

  it("respects maxChars limit", () => {
    const tiny = buildContextFromResults(results, 50);
    const entries = tiny.split("---\n").length;
    const full = buildContextFromResults(results, 5000);
    const fullEntries = full.split("---\n").length;
    expect(fullEntries).toBeGreaterThan(entries);
  });

  it("truncates individual content to 500 characters", () => {
    const long = "x".repeat(1000);
    const result = buildContextFromResults(
      [{ companyName: "Test", sectionType: "desc", content: long }],
      5000,
    );
    expect(result).not.toContain("x".repeat(501));
    expect(result).toContain("x".repeat(500));
  });

  it("stops adding entries when maxChars would be exceeded", () => {
    const maxChars = 100;
    const result = buildContextFromResults(results, maxChars);
    expect(result.length).toBeLessThanOrEqual(maxChars + 100);
  });

  it("returns fallback message for empty results", () => {
    const result = buildContextFromResults([], 5000);
    expect(result).toBe("No relevant context available.");
  });

  it("uses default maxChars of 3000 when not specified", () => {
    const result = buildContextFromResults(results);
    expect(result).toContain("Google");
    expect(result).toContain("Meta");
    expect(result).toContain("Apple");
  });

  it("separates entries with triple dash", () => {
    const result = buildContextFromResults(results, 5000);
    expect(result).toMatch(/---/);
  });
});
