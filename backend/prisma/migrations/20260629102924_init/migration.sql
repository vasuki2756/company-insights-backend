-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_user_id_fkey";

-- DropForeignKey
ALTER TABLE "company_embeddings" DROP CONSTRAINT "company_embeddings_company_id_fkey";

-- DropForeignKey
ALTER TABLE "company_profiles" DROP CONSTRAINT "company_profiles_company_id_fkey";

-- DropForeignKey
ALTER TABLE "company_skill_requirements" DROP CONSTRAINT "company_skill_requirements_company_id_fkey";

-- DropForeignKey
ALTER TABLE "company_skill_requirements" DROP CONSTRAINT "company_skill_requirements_skill_id_fkey";

-- DropForeignKey
ALTER TABLE "skill_topics" DROP CONSTRAINT "skill_topics_skill_id_fkey";

-- DropForeignKey
ALTER TABLE "student_skills" DROP CONSTRAINT "student_skills_skill_id_fkey";

-- DropForeignKey
ALTER TABLE "student_skills" DROP CONSTRAINT "student_skills_user_id_fkey";

-- DropForeignKey
ALTER TABLE "student_target_companies" DROP CONSTRAINT "student_target_companies_company_id_fkey";

-- DropForeignKey
ALTER TABLE "student_target_companies" DROP CONSTRAINT "student_target_companies_user_id_fkey";

-- AlterTable
ALTER TABLE "companies" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "company_profiles" ALTER COLUMN "core_values" DROP DEFAULT,
ALTER COLUMN "history_timeline" DROP DEFAULT,
ALTER COLUMN "key_leaders" DROP DEFAULT,
ALTER COLUMN "board_members" DROP DEFAULT,
ALTER COLUMN "key_investors" DROP DEFAULT,
ALTER COLUMN "operating_countries" DROP DEFAULT,
ALTER COLUMN "office_locations" DROP DEFAULT,
ALTER COLUMN "offerings_description" DROP DEFAULT,
ALTER COLUMN "focus_sectors" DROP DEFAULT,
ALTER COLUMN "top_customers" DROP DEFAULT,
ALTER COLUMN "tech_stack" DROP DEFAULT,
ALTER COLUMN "intellectual_property" DROP DEFAULT,
ALTER COLUMN "cybersecurity_posture" DROP DEFAULT,
ALTER COLUMN "key_competitors" DROP DEFAULT,
ALTER COLUMN "competitive_advantages" DROP DEFAULT,
ALTER COLUMN "weaknesses_gaps" DROP DEFAULT,
ALTER COLUMN "strategic_priorities" DROP DEFAULT,
ALTER COLUMN "innovation_roadmap" DROP DEFAULT,
ALTER COLUMN "esg_ratings" DROP DEFAULT,
ALTER COLUMN "mentorship_availability" DROP DEFAULT,
ALTER COLUMN "esops_incentives" DROP DEFAULT,
ALTER COLUMN "family_health_insurance" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "student_skills" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_embeddings" ADD CONSTRAINT "company_embeddings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_skill_requirements" ADD CONSTRAINT "company_skill_requirements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_skill_requirements" ADD CONSTRAINT "company_skill_requirements_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_topics" ADD CONSTRAINT "skill_topics_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_target_companies" ADD CONSTRAINT "student_target_companies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_target_companies" ADD CONSTRAINT "student_target_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_skills" ADD CONSTRAINT "student_skills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_skills" ADD CONSTRAINT "student_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
