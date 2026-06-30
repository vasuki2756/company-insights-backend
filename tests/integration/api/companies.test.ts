import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import companyRoutes from "../../../src/routes/companies";
import { db } from "../../../src/lib/db";

vi.mock("../../../src/middleware/auth", () => ({
  requireAuth: vi.fn((_req: any, _res: any, next: any) => next()),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  AuthenticatedRequest: Object,
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/companies", companyRoutes);
  return app;
}

const mockCompanies = [
  {
    company_id: 1,
    name: "Acme Corp",
    shortName: "Acme",
    category: "Technology",
    companyType: "Private",
    headquarters: "San Francisco, CA",
    minCgpa: null,
    package: "12 LPA",
    glassdoorRating: null,
    googleRating: null,
    employeeSize: "1000-5000",
    selectionRate: "15",
    applicationDeadline: null,
    driveDate: null,
    createdAt: new Date("2025-01-01"),
  },
  {
    company_id: 2,
    name: "Beta Inc",
    shortName: "Beta",
    category: "Finance",
    companyType: "Public",
    headquarters: "New York, NY",
    minCgpa: 8.5,
    package: "15 LPA",
    glassdoorRating: 4.2,
    googleRating: 4.5,
    employeeSize: "5000+",
    selectionRate: "5",
    applicationDeadline: new Date("2025-06-01"),
    driveDate: new Date("2025-07-01"),
    createdAt: new Date("2025-01-15"),
  },
];

const mockSingleCompany = {
  company_id: 1,
  name: "Acme Corp",
  shortName: "Acme",
  category: "Technology",
  companyType: "Private",
  incorporationYear: "2010",
  employeeSize: "1000-5000",
  employeeCount: 2500,
  headquarters: "San Francisco, CA",
  websiteUrl: "https://acme.example.com",
  minCgpa: null,
  package: "12 LPA",
  selectionRate: "15",
  applicationDeadline: null,
  driveDate: null,
  yoyGrowthRate: null,
  glassdoorRating: null,
  googleRating: null,
  createdAt: new Date("2025-01-01"),
};

describe("GET /api/v1/companies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns paginated company list", async () => {
    vi.mocked(db.company.findMany).mockResolvedValue(mockCompanies);
    vi.mocked(db.company.count).mockResolvedValue(2);

    const app = createApp();
    const res = await request(app).get("/api/v1/companies");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.companies).toHaveLength(2);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.hasMore).toBe(false);
  });

  it("supports filtering by category", async () => {
    vi.mocked(db.company.findMany).mockResolvedValue([mockCompanies[0]]);
    vi.mocked(db.company.count).mockResolvedValue(1);

    const app = createApp();
    const res = await request(app).get("/api/v1/companies?category=Technology");

    expect(res.status).toBe(200);
    expect(res.body.data.companies).toHaveLength(1);
    expect(res.body.data.companies[0].category).toBe("Technology");
  });

  it("supports search query", async () => {
    vi.mocked(db.company.findMany).mockResolvedValue([mockCompanies[0]]);
    vi.mocked(db.company.count).mockResolvedValue(1);

    const app = createApp();
    const res = await request(app).get("/api/v1/companies?search=Acme");

    expect(res.status).toBe(200);
    expect(res.body.data.companies).toHaveLength(1);
  });

  it("supports pagination parameters", async () => {
    vi.mocked(db.company.findMany).mockResolvedValue([mockCompanies[0]]);
    vi.mocked(db.company.count).mockResolvedValue(2);

    const app = createApp();
    const res = await request(app).get("/api/v1/companies?page=2&limit=1");

    expect(res.status).toBe(200);
    expect(res.body.data.page).toBe(2);
    expect(res.body.data.companies).toHaveLength(1);
    expect(res.body.data.hasMore).toBe(false);
  });

  it("returns 400 for invalid pagination", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/companies?page=-1");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("supports sorting", async () => {
    vi.mocked(db.company.findMany).mockResolvedValue([mockCompanies[1], mockCompanies[0]]);
    vi.mocked(db.company.count).mockResolvedValue(2);

    const app = createApp();
    const res = await request(app).get("/api/v1/companies?sortBy=name");

    expect(res.status).toBe(200);
  });
});

describe("GET /api/v1/companies/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns company by ID", async () => {
    vi.mocked(db.company.findUnique).mockResolvedValue({
      ...mockSingleCompany,
      company_json: {
        json_id: 1,
        company_id: 1,
        short_json: { overview_text: "A leading tech company" },
        full_json: null,
      },
      company_skill_levels: [],
    });

    const app = createApp();
    const res = await request(app).get("/api/v1/companies/1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.company.id).toBe(1);
    expect(res.body.data.company.name).toBe("Acme Corp");
    expect(res.body.data.profile).toBeDefined();
    expect(res.body.data.skills).toEqual([]);
  });

  it("returns 404 for non-existent company", async () => {
    vi.mocked(db.company.findUnique).mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get("/api/v1/companies/9999");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Company not found/);
  });

  it("returns 400 for invalid company ID", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/companies/abc");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid/);
  });
});
