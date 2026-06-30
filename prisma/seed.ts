import { PrismaClient, Role, SkillCriticality } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting seed...");

  await prisma.auditLog.deleteMany();
  await prisma.studentPrepProgress.deleteMany();
  await prisma.studentFavorite.deleteMany();
  await prisma.studentTarget.deleteMany();
  await prisma.studentSkill.deleteMany();
  await prisma.embedding.deleteMany();
  await prisma.company_json.deleteMany();
  await prisma.company_skill_levels.deleteMany();
  await prisma.skill_set_topics.deleteMany();
  await prisma.skill_set_master.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();

  console.log("  Cleaned existing data");

  const passwordHash = await bcrypt.hash("password123", 12);

  const adminUser = await prisma.user.create({
    data: {
      email: "admin@karunya.edu",
      name: "Admin User",
      passwordHash,
      role: Role.admin,
      profileData: { department: "Placement Cell" },
    },
  });

  const studentUser = await prisma.user.create({
    data: {
      email: "student@karunya.edu",
      name: "John Student",
      passwordHash,
      role: Role.student,
      profileData: {
        cgpa: 8.5,
        branch: "CSE",
        year: "Third Year",
        targetSalaryMin: 12,
        targetSalaryMax: 30,
        availableHoursPerWeek: 15,
      },
    },
  });

  const recruiterUser = await prisma.user.create({
    data: {
      email: "recruiter@google.com",
      name: "Jane Recruiter",
      passwordHash,
      role: Role.recruiter,
      profileData: { company: "Google" },
    },
  });

  console.log("  Created 3 users (admin, student, recruiter)");
  console.log("    Default password for all: password123");

  const skillData = [
    { skill_set_name: "Python", short_name: "PY", skill_set_description: "General-purpose programming language", category: "backend" },
    { skill_set_name: "JavaScript", short_name: "JS", skill_set_description: "Web scripting language", category: "frontend" },
    { skill_set_name: "TypeScript", short_name: "TS", skill_set_description: "Typed superset of JavaScript", category: "frontend" },
    { skill_set_name: "React", short_name: "REACT", skill_set_description: "UI component library", category: "frontend" },
    { skill_set_name: "Node.js", short_name: "NODE", skill_set_description: "JavaScript runtime", category: "backend" },
    { skill_set_name: "SQL", short_name: "SQL", skill_set_description: "Database query language", category: "backend" },
    { skill_set_name: "DSA", short_name: "DSA", skill_set_description: "Data structures and algorithms", category: "core" },
    { skill_set_name: "System Design", short_name: "SYSDSGN", skill_set_description: "Distributed system architecture", category: "core" },
    { skill_set_name: "Docker", short_name: "DOCKER", skill_set_description: "Containerization platform", category: "devops" },
    { skill_set_name: "Machine Learning", short_name: "ML", skill_set_description: "Predictive modeling and AI", category: "ml" },
    { skill_set_name: "AWS", short_name: "AWS", skill_set_description: "Cloud infrastructure services", category: "devops" },
    { skill_set_name: "Git", short_name: "GIT", skill_set_description: "Version control system", category: "tools" },
    { skill_set_name: "Java", short_name: "JAVA", skill_set_description: "Enterprise programming language", category: "backend" },
    { skill_set_name: "C++", short_name: "CPP", skill_set_description: "Systems programming language", category: "backend" },
  ];

  const skills = await Promise.all(
    skillData.map((s) => prisma.skill_set_master.create({ data: s })),
  );

  const skillMap = new Map(skills.map((s) => [s.skill_set_name, s]));

  console.log(`  Created ${skills.length} skills`);

  const companyData = [
    {
      company_id: 1,
      name: "Google",
      shortName: "Google",
      category: "Super Dream",
      incorporationYear: "1998",
      employeeSize: "180,000+",
      employeeCount: 180000,
      headquarters: "Mountain View, California, USA",
      websiteUrl: "https://google.com",
      minCgpa: 8.0,
      package: "30-45 LPA",
      selectionRate: "0.1%",
      yoyGrowthRate: "23%",
      glassdoorRating: 4.4,
      googleRating: 4.6,
      companyType: "Super Dream",
    },
    {
      company_id: 2,
      name: "Microsoft",
      shortName: "Microsoft",
      category: "Super Dream",
      incorporationYear: "1975",
      employeeSize: "220,000+",
      employeeCount: 220000,
      headquarters: "Redmond, Washington, USA",
      websiteUrl: "https://microsoft.com",
      minCgpa: 7.5,
      package: "25-40 LPA",
      selectionRate: "0.2%",
      yoyGrowthRate: "18%",
      glassdoorRating: 4.3,
      googleRating: 4.5,
      companyType: "Super Dream",
    },
    {
      company_id: 3,
      name: "Amazon",
      shortName: "Amazon",
      category: "Super Dream",
      incorporationYear: "1994",
      employeeSize: "1,500,000+",
      employeeCount: 1500000,
      headquarters: "Seattle, Washington, USA",
      websiteUrl: "https://amazon.com",
      minCgpa: 7.0,
      package: "25-35 LPA",
      selectionRate: "0.5%",
      yoyGrowthRate: "22%",
      glassdoorRating: 3.8,
      googleRating: 4.2,
      companyType: "Super Dream",
    },
    {
      company_id: 4,
      name: "Flipkart",
      shortName: "Flipkart",
      category: "Dream",
      incorporationYear: "2007",
      employeeSize: "50,000+",
      employeeCount: 50000,
      headquarters: "Bengaluru, Karnataka, India",
      websiteUrl: "https://flipkart.com",
      minCgpa: 7.0,
      package: "16-25 LPA",
      selectionRate: "0.5%",
      yoyGrowthRate: "15%",
      glassdoorRating: 3.9,
      googleRating: 4.0,
      companyType: "Dream",
    },
    {
      company_id: 5,
      name: "TCS",
      shortName: "TCS",
      category: "Standard",
      incorporationYear: "1968",
      employeeSize: "600,000+",
      employeeCount: 600000,
      headquarters: "Mumbai, Maharashtra, India",
      websiteUrl: "https://tcs.com",
      minCgpa: 6.0,
      package: "3.5-7 LPA",
      selectionRate: "5%",
      yoyGrowthRate: "10%",
      glassdoorRating: 3.7,
      googleRating: 3.9,
      companyType: "Regular",
    },
  ];

  const companies = await Promise.all(
    companyData.map((c) => prisma.company.create({ data: c })),
  );

  const companyMap = new Map(companies.map((c) => [c.name, c]));

  console.log(`  Created ${companies.length} companies`);

  const profileData = [
    {
      company_id: companyMap.get("Google")!.company_id,
      full_json: {
        overviewText: "Google LLC is an American multinational technology company specializing in search engine technology, cloud computing, software, and advertising.",
        visionStatement: "To provide access to the world's information in one click.",
        missionStatement: "To organize the world's information and make it universally accessible and useful.",
        coreValues: ["Focus on the user", "Fast is better than slow", "Democracy on the web", "You can make money without doing evil"],
        techStack: ["Go", "Java", "Python", "C++", "TensorFlow", "Kubernetes", "Borg", "Bigtable", "Spanner"],
        aiMlAdoptionLevel: "Leader",
        glassdoorPros: "Great compensation, smart colleagues, excellent perks",
        glassdoorCons: "Slow promotion cycles, internal politics",
        ratingCombined: 4.4,
      },
    },
    {
      company_id: companyMap.get("Microsoft")!.company_id,
      full_json: {
        overviewText: "Microsoft Corporation is an American multinational technology corporation producing computer software, consumer electronics, personal computers, and related services.",
        visionStatement: "To empower every person and every organization on the planet to achieve more.",
        missionStatement: "Empower every person and every organization to achieve more.",
        coreValues: ["Innovation", "Diversity and inclusion", "Corporate social responsibility", "Trustworthy computing"],
        techStack: ["C#", ".NET", "TypeScript", "Azure", "React", "VS Code", "GitHub"],
        aiMlAdoptionLevel: "Leader",
        glassdoorPros: "Good work-life balance, strong benefits, cutting-edge technology",
        glassdoorCons: "Bureaucracy, slow decision making",
        ratingCombined: 4.3,
      },
    },
  ];

  for (const profile of profileData) {
    await prisma.company_json.create({ data: profile });
  }

  console.log(`  Created ${profileData.length} company profiles`);

  const profLevels = [
    { proficiency_level_id: 1, proficiency_name: "Beginner", proficiency_code: "BEG", proficiency_description: "Basic familiarity" },
    { proficiency_level_id: 2, proficiency_name: "Elementary", proficiency_code: "ELE", proficiency_description: "Can perform with guidance" },
    { proficiency_level_id: 3, proficiency_name: "Intermediate", proficiency_code: "INT", proficiency_description: "Working knowledge" },
    { proficiency_level_id: 4, proficiency_name: "Upper Intermediate", proficiency_code: "UIN", proficiency_description: "Can work independently" },
    { proficiency_level_id: 5, proficiency_name: "Advanced", proficiency_code: "ADV", proficiency_description: "Deep understanding" },
    { proficiency_level_id: 6, proficiency_name: "Proficient", proficiency_code: "PRO", proficiency_description: "Can mentor others" },
    { proficiency_level_id: 7, proficiency_name: "Expert", proficiency_code: "EXP", proficiency_description: "Subject matter expert" },
    { proficiency_level_id: 8, proficiency_name: "Master", proficiency_code: "MAS", proficiency_description: "Industry-leading skill" },
    { proficiency_level_id: 9, proficiency_name: "Visionary", proficiency_code: "VIS", proficiency_description: "Defines best practices" },
    { proficiency_level_id: 10, proficiency_name: "Pioneer", proficiency_code: "PIO", proficiency_description: "Creates new paradigms" },
  ];

  for (const pl of profLevels) {
    await prisma.proficiency_levels.create({ data: pl });
  }

  console.log(`  Created ${profLevels.length} proficiency levels`);

  const googleId = companyMap.get("Google")!.company_id;
  const microsoftId = companyMap.get("Microsoft")!.company_id;

  const reqData = [
    { company_id: googleId, skill_set_id: skillMap.get("DSA")!.skill_set_id, required_level: 9, criticality: SkillCriticality.Critical, required_proficiency_level_id: 8 },
    { company_id: googleId, skill_set_id: skillMap.get("System Design")!.skill_set_id, required_level: 8, criticality: SkillCriticality.Critical, required_proficiency_level_id: 7 },
    { company_id: googleId, skill_set_id: skillMap.get("Python")!.skill_set_id, required_level: 7, criticality: SkillCriticality.Important, required_proficiency_level_id: 6 },
    { company_id: googleId, skill_set_id: skillMap.get("JavaScript")!.skill_set_id, required_level: 5, criticality: SkillCriticality.Baseline, required_proficiency_level_id: 5 },
    { company_id: googleId, skill_set_id: skillMap.get("Machine Learning")!.skill_set_id, required_level: 6, criticality: SkillCriticality.Important, required_proficiency_level_id: 5 },
    { company_id: microsoftId, skill_set_id: skillMap.get("DSA")!.skill_set_id, required_level: 8, criticality: SkillCriticality.Critical, required_proficiency_level_id: 7 },
    { company_id: microsoftId, skill_set_id: skillMap.get("System Design")!.skill_set_id, required_level: 7, criticality: SkillCriticality.Important, required_proficiency_level_id: 6 },
    { company_id: microsoftId, skill_set_id: skillMap.get("C++")!.skill_set_id, required_level: 6, criticality: SkillCriticality.Important, required_proficiency_level_id: 5 },
    { company_id: microsoftId, skill_set_id: skillMap.get("TypeScript")!.skill_set_id, required_level: 7, criticality: SkillCriticality.Important, required_proficiency_level_id: 6 },
    { company_id: microsoftId, skill_set_id: skillMap.get("AWS")!.skill_set_id, required_level: 5, criticality: SkillCriticality.Baseline, required_proficiency_level_id: 4 },
  ];

  for (const req of reqData) {
    await prisma.company_skill_levels.create({ data: req });
  }

  console.log(`  Created ${reqData.length} company skill requirements`);

  const dsaId = skillMap.get("DSA")!.skill_set_id;
  const pythonId = skillMap.get("Python")!.skill_set_id;

  const topicData = [
    { skill_set_id: dsaId, level_number: 1, topics: "Arrays & Strings" },
    { skill_set_id: dsaId, level_number: 2, topics: "Linked Lists" },
    { skill_set_id: dsaId, level_number: 3, topics: "Stacks & Queues" },
    { skill_set_id: dsaId, level_number: 4, topics: "Trees & Graphs" },
    { skill_set_id: dsaId, level_number: 5, topics: "Dynamic Programming" },
    { skill_set_id: dsaId, level_number: 6, topics: "Greedy Algorithms" },
    { skill_set_id: dsaId, level_number: 7, topics: "Graph Algorithms" },
    { skill_set_id: dsaId, level_number: 8, topics: "Advanced Data Structures" },
    { skill_set_id: dsaId, level_number: 9, topics: "Network Flow & Matching" },
    { skill_set_id: dsaId, level_number: 10, topics: "Competitive Programming" },
    { skill_set_id: pythonId, level_number: 1, topics: "Python Basics" },
    { skill_set_id: pythonId, level_number: 2, topics: "Functions & Modules" },
    { skill_set_id: pythonId, level_number: 3, topics: "OOP in Python" },
    { skill_set_id: pythonId, level_number: 4, topics: "File I/O & Exceptions" },
    { skill_set_id: pythonId, level_number: 5, topics: "Advanced Python" },
    { skill_set_id: pythonId, level_number: 6, topics: "Concurrency" },
    { skill_set_id: pythonId, level_number: 7, topics: "Testing & Debugging" },
    { skill_set_id: pythonId, level_number: 8, topics: "Web Frameworks" },
    { skill_set_id: pythonId, level_number: 9, topics: "Data Science Stack" },
    { skill_set_id: pythonId, level_number: 10, topics: "Production Python" },
  ];

  for (const topic of topicData) {
    await prisma.skill_set_topics.create({ data: topic });
  }

  console.log(`  Created ${topicData.length} skill topics`);

  await prisma.studentSkill.createMany({
    data: [
      { userId: studentUser.id, skillSetId: skillMap.get("Python")!.skill_set_id, proficiencyLevel: 7 },
      { userId: studentUser.id, skillSetId: skillMap.get("JavaScript")!.skill_set_id, proficiencyLevel: 6 },
      { userId: studentUser.id, skillSetId: skillMap.get("DSA")!.skill_set_id, proficiencyLevel: 5 },
      { userId: studentUser.id, skillSetId: skillMap.get("React")!.skill_set_id, proficiencyLevel: 4 },
      { userId: studentUser.id, skillSetId: skillMap.get("SQL")!.skill_set_id, proficiencyLevel: 6 },
    ],
  });

  console.log("  Created student skill assessments");

  await prisma.studentTarget.createMany({
    data: [
      { userId: studentUser.id, companyId: companyMap.get("Google")!.company_id },
      { userId: studentUser.id, companyId: companyMap.get("Microsoft")!.company_id },
      { userId: studentUser.id, companyId: companyMap.get("Flipkart")!.company_id },
    ],
  });

  await prisma.studentFavorite.createMany({
    data: [
      { userId: studentUser.id, companyId: companyMap.get("Google")!.company_id },
      { userId: studentUser.id, companyId: companyMap.get("Microsoft")!.company_id },
    ],
  });

  console.log("  Created student target companies and favorites");

  const counts = {
    users: await prisma.user.count(),
    companies: await prisma.company.count(),
    profiles: await prisma.company_json.count(),
    skills: await prisma.skill_set_master.count(),
    requirements: await prisma.company_skill_levels.count(),
    topics: await prisma.skill_set_topics.count(),
    studentSkills: await prisma.studentSkill.count(),
    targets: await prisma.studentTarget.count(),
  };

  console.log("\nSeed Summary:");
  for (const [key, value] of Object.entries(counts)) {
    console.log(`  ${key}: ${value}`);
  }
  console.log("\nSeed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
