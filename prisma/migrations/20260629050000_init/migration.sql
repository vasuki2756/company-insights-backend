-- ─────────────────────────────────────────────────────────────
-- KITS Placement Intelligence Hub — Initial Migration
-- PostgreSQL 16 + pgvector
-- ─────────────────────────────────────────────────────────────

-- Enable pgvector extension for embedding support
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────
-- Create custom enum types
-- ─────────────────────────────────────────────────────────────
CREATE TYPE "UserRole" AS ENUM ('student', 'recruiter', 'admin');
CREATE TYPE "SkillCriticality" AS ENUM ('Critical', 'Important', 'Baseline');

-- ─────────────────────────────────────────────────────────────
-- Table: users
-- ─────────────────────────────────────────────────────────────
CREATE TABLE "users" (
  "id"            UUID        DEFAULT gen_random_uuid() NOT NULL,
  "email"         VARCHAR(255) NOT NULL,
  "name"          VARCHAR(255) NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "role"          "UserRole"  DEFAULT 'student' NOT NULL,
  "profile_data"  JSONB,
  "last_login"    TIMESTAMPTZ,
  "created_at"    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  "updated_at"    TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_email_key" UNIQUE ("email")
);

-- ─────────────────────────────────────────────────────────────
-- Table: companies
-- ─────────────────────────────────────────────────────────────
CREATE TABLE "companies" (
  "id"                  SERIAL       NOT NULL,
  "name"                VARCHAR(255) NOT NULL,
  "short_name"          VARCHAR(100),
  "category"            VARCHAR(100),
  "company_type"        VARCHAR(50),
  "incorporation_year"  INTEGER,
  "employee_size"       VARCHAR(50),
  "employee_count"      INTEGER,
  "headquarters"        VARCHAR(500),
  "website_url"         VARCHAR(500),
  "min_cgpa"            DECIMAL(3, 2),
  "package"             VARCHAR(50),
  "selection_rate"      VARCHAR(50),
  "application_deadline" DATE,
  "drive_date"          DATE,
  "yoy_growth_rate"     VARCHAR(50),
  "glassdoor_rating"    DECIMAL(3, 1),
  "google_rating"       DECIMAL(3, 1),
  "created_at"          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  "updated_at"          TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT "companies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "companies_name_key" UNIQUE ("name")
);

-- Indexes for companies
CREATE INDEX "companies_category_idx" ON "companies" ("category");
CREATE INDEX "companies_company_type_idx" ON "companies" ("company_type");
CREATE INDEX "companies_min_cgpa_idx" ON "companies" ("min_cgpa");

-- ─────────────────────────────────────────────────────────────
-- Table: company_profiles
-- ─────────────────────────────────────────────────────────────
CREATE TABLE "company_profiles" (
  "company_id"              INTEGER       NOT NULL,

  -- Identity & Overview
  "overview_text"           TEXT,
  "vision_statement"        TEXT,
  "mission_statement"       TEXT,
  "core_values"             TEXT[]        DEFAULT '{}',
  "history_timeline"        TEXT[]        DEFAULT '{}',

  -- Leadership
  "ceo_name"                VARCHAR(255),
  "ceo_linkedin_url"        VARCHAR(500),
  "key_leaders"             TEXT[]        DEFAULT '{}',
  "board_members"           TEXT[]        DEFAULT '{}',

  -- Financials
  "annual_revenue"          VARCHAR(100),
  "annual_profit"           VARCHAR(100),
  "valuation"               VARCHAR(100),
  "revenue_mix"             VARCHAR(255),
  "profitability_status"    VARCHAR(100),
  "key_investors"           TEXT[]        DEFAULT '{}',
  "total_capital_raised"    VARCHAR(100),
  "burn_rate"               VARCHAR(50),
  "runway_months"           INTEGER,

  -- Global Presence
  "operating_countries"     TEXT[]        DEFAULT '{}',
  "office_count"            INTEGER,
  "office_locations"        TEXT[]        DEFAULT '{}',

  -- Products & Services
  "offerings_description"   TEXT[]        DEFAULT '{}',
  "focus_sectors"           TEXT[]        DEFAULT '{}',
  "top_customers"           TEXT[]        DEFAULT '{}',

  -- Technology
  "tech_stack"              TEXT[]        DEFAULT '{}',
  "ai_ml_adoption_level"    VARCHAR(50),
  "r_and_d_investment"      VARCHAR(100),
  "intellectual_property"   TEXT[]        DEFAULT '{}',
  "cybersecurity_posture"   TEXT[]        DEFAULT '{}',

  -- Competitive
  "key_competitors"         TEXT[]        DEFAULT '{}',
  "market_share_percentage" VARCHAR(50),
  "competitive_advantages"  TEXT[]        DEFAULT '{}',
  "weaknesses_gaps"         TEXT[]        DEFAULT '{}',

  -- Market
  "tam"                     VARCHAR(100),
  "sam"                     VARCHAR(100),
  "som"                     VARCHAR(100),
  "strategic_priorities"    TEXT[]        DEFAULT '{}',
  "innovation_roadmap"      TEXT[]        DEFAULT '{}',

  -- ESG & Culture
  "esg_ratings"             TEXT[]        DEFAULT '{}',
  "sustainability_csr"      TEXT,
  "work_culture_summary"    TEXT,
  "diversity_inclusion_score" DECIMAL(3, 1),
  "burnout_risk"            VARCHAR(50),
  "psychological_safety"    VARCHAR(50),

  -- Career & Compensation
  "training_spend"          VARCHAR(50),
  "mentorship_availability" TEXT[]        DEFAULT '{}',
  "internal_mobility"       VARCHAR(100),
  "avg_retention_tenure"    DECIMAL(3, 1),
  "employee_turnover"       VARCHAR(50),
  "fixed_vs_variable_pay"   VARCHAR(100),
  "esops_incentives"        TEXT[]        DEFAULT '{}',
  "family_health_insurance" TEXT[]        DEFAULT '{}',

  -- Ratings
  "glassdoor_pros"          TEXT,
  "glassdoor_cons"          TEXT,
  "rating_combined"         DECIMAL(3, 1),
  "indeed_rating"           DECIMAL(3, 1),
  "google_rating"           DECIMAL(3, 1),
  "brand_value"             VARCHAR(100),
  "brand_sentiment_score"   DECIMAL(3, 1),

  -- Contact
  "primary_contact_email"   VARCHAR(255),
  "primary_phone_number"    VARCHAR(50),

  "created_at"              TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  "updated_at"              TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT "company_profiles_pkey" PRIMARY KEY ("company_id"),
  CONSTRAINT "company_profiles_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES "companies" ("id") ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────────────
-- Table: company_embeddings (pgvector)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE "company_embeddings" (
  "id"            SERIAL       NOT NULL,
  "company_id"    INTEGER      NOT NULL,
  "section_type"  VARCHAR(50)  NOT NULL,
  "content"       TEXT         NOT NULL,
  "embedding"     vector(384),
  "created_at"    TIMESTAMPTZ  DEFAULT NOW() NOT NULL,

  CONSTRAINT "company_embeddings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "company_embeddings_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES "companies" ("id") ON DELETE CASCADE
);

-- Indexes for embeddings
CREATE INDEX "company_embeddings_company_id_idx" ON "company_embeddings" ("company_id");
CREATE INDEX "company_embeddings_section_type_idx" ON "company_embeddings" ("section_type");

-- Create an IVFFlat index for approximate nearest neighbor search
-- (Run AFTER data is inserted: 100 is the number of centroids; tune based on data size)
-- CREATE INDEX "company_embeddings_vector_idx" ON "company_embeddings"
--   USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

-- ─────────────────────────────────────────────────────────────
-- Table: skills
-- ─────────────────────────────────────────────────────────────
CREATE TABLE "skills" (
  "id"          SERIAL       NOT NULL,
  "name"        VARCHAR(255) NOT NULL,
  "category"    VARCHAR(100),
  "description" TEXT,
  "created_at"  TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT "skills_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "skills_name_key" UNIQUE ("name")
);

-- ─────────────────────────────────────────────────────────────
-- Table: company_skill_requirements
-- ─────────────────────────────────────────────────────────────
CREATE TABLE "company_skill_requirements" (
  "company_id"        INTEGER            NOT NULL,
  "skill_id"          INTEGER            NOT NULL,
  "required_level"    INTEGER            NOT NULL,
  "criticality"       "SkillCriticality" DEFAULT 'Important' NOT NULL,
  "proficiency_level" INTEGER,

  CONSTRAINT "company_skill_requirements_pkey" PRIMARY KEY ("company_id", "skill_id"),
  CONSTRAINT "company_skill_requirements_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES "companies" ("id") ON DELETE CASCADE,
  CONSTRAINT "company_skill_requirements_skill_id_fkey" FOREIGN KEY ("skill_id")
    REFERENCES "skills" ("id") ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────────────
-- Table: skill_topics
-- ─────────────────────────────────────────────────────────────
CREATE TABLE "skill_topics" (
  "id"            SERIAL       NOT NULL,
  "skill_id"      INTEGER      NOT NULL,
  "level_number"  INTEGER      NOT NULL,
  "topic_name"    VARCHAR(255) NOT NULL,
  "description"   TEXT,
  "resources_url" VARCHAR(500),

  CONSTRAINT "skill_topics_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "skill_topics_skill_id_fkey" FOREIGN KEY ("skill_id")
    REFERENCES "skills" ("id") ON DELETE CASCADE
);

CREATE INDEX "skill_topics_skill_id_level_number_idx" ON "skill_topics" ("skill_id", "level_number");

-- ─────────────────────────────────────────────────────────────
-- Table: student_target_companies
-- ─────────────────────────────────────────────────────────────
CREATE TABLE "student_target_companies" (
  "user_id"      UUID         NOT NULL,
  "company_id"   INTEGER      NOT NULL,
  "added_at"     TIMESTAMPTZ  DEFAULT NOW() NOT NULL,
  "is_favorited" BOOLEAN      DEFAULT TRUE NOT NULL,

  CONSTRAINT "student_target_companies_pkey" PRIMARY KEY ("user_id", "company_id"),
  CONSTRAINT "student_target_companies_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users" ("id") ON DELETE CASCADE,
  CONSTRAINT "student_target_companies_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES "companies" ("id") ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────────────
-- Table: student_skills
-- ─────────────────────────────────────────────────────────────
CREATE TABLE "student_skills" (
  "user_id"       UUID  NOT NULL,
  "skill_id"      INTEGER NOT NULL,
  "current_level" INTEGER NOT NULL,
  "updated_at"    TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT "student_skills_pkey" PRIMARY KEY ("user_id", "skill_id"),
  CONSTRAINT "student_skills_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users" ("id") ON DELETE CASCADE,
  CONSTRAINT "student_skills_skill_id_fkey" FOREIGN KEY ("skill_id")
    REFERENCES "skills" ("id") ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────────────
-- Table: audit_logs
-- ─────────────────────────────────────────────────────────────
CREATE TABLE "audit_logs" (
  "id"            SERIAL       NOT NULL,
  "user_id"       UUID,
  "action"        VARCHAR(100) NOT NULL,
  "resource_type" VARCHAR(100),
  "resource_id"   VARCHAR(100),
  "changes"       JSONB,
  "ip_address"    VARCHAR(45),
  "user_agent"    VARCHAR(500),
  "created_at"    TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users" ("id") ON DELETE SET NULL
);

-- Indexes for audit logs
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs" ("user_id");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" ("created_at");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" ("action");

-- ─────────────────────────────────────────────────────────────
-- Trigger: auto-update updated_at columns
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_companies_updated_at
  BEFORE UPDATE ON "companies"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_company_profiles_updated_at
  BEFORE UPDATE ON "company_profiles"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
