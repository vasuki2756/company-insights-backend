// ─────────────────────────────────────────────────────────────
// KITS Placement Intelligence Hub — Database Seed
// Populates development database with sample data
// Usage: npx prisma db seed
// ─────────────────────────────────────────────────────────────

import { PrismaClient, UserRole, SkillCriticality } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seed...");

  // ── Clean existing data ──────────────────────────────────
  await prisma.auditLog.deleteMany();
  await prisma.studentSkill.deleteMany();
  await prisma.studentTargetCompany.deleteMany();
  await prisma.companyEmbedding.deleteMany();
  await prisma.companyProfile.deleteMany();
  await prisma.companySkillRequirement.deleteMany();
  await prisma.skillTopic.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();

  console.log("  ✓ Cleaned existing data");

  // ── Users ────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("password123", 12);

  const adminUser = await prisma.user.create({
    data: {
      email: "admin@karunya.edu",
      name: "Admin User",
      passwordHash,
      role: UserRole.admin,
      profileData: { department: "Placement Cell" },
    },
  });

  const studentUser = await prisma.user.create({
    data: {
      email: "student@karunya.edu",
      name: "John Student",
      passwordHash,
      role: UserRole.student,
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
      role: UserRole.recruiter,
      profileData: { company: "Google" },
    },
  });

  console.log("  ✓ Created 3 users (admin, student, recruiter)");
  console.log("    Default password for all: password123");

  // ── Skills ──────────────────────────────────────────────
  const skillData = [
    { name: "Python", category: "backend", description: "General-purpose programming language" },
    { name: "JavaScript", category: "frontend", description: "Web scripting language" },
    { name: "TypeScript", category: "frontend", description: "Typed superset of JavaScript" },
    { name: "React", category: "frontend", description: "UI component library" },
    { name: "Node.js", category: "backend", description: "JavaScript runtime" },
    { name: "SQL", category: "backend", description: "Database query language" },
    { name: "Data Structures & Algorithms", category: "core", description: "Computational problem solving" },
    { name: "System Design", category: "core", description: "Distributed system architecture" },
    { name: "Docker", category: "devops", description: "Containerization platform" },
    { name: "Kubernetes", category: "devops", description: "Container orchestration" },
    { name: "Machine Learning", category: "ml", description: "Predictive modeling and AI" },
    { name: "Cloud Computing (AWS)", category: "devops", description: "Cloud infrastructure services" },
    { name: "Git", category: "tools", description: "Version control system" },
    { name: "Java", category: "backend", description: "Enterprise programming language" },
    { name: "C++", category: "backend", description: "Systems programming language" },
    { name: "Networking", category: "core", description: "Computer network fundamentals" },
    { name: "Cybersecurity", category: "core", description: "Information security" },
    { name: "DevOps", category: "devops", description: "CI/CD and infrastructure automation" },
    { name: "React Native", category: "mobile", description: "Mobile app development" },
    { name: "Flutter", category: "mobile", description: "Cross-platform mobile framework" },
  ];

  const skills = await Promise.all(
    skillData.map((s) => prisma.skill.create({ data: s })),
  );

  const skillMap = new Map(skills.map((s) => [s.name, s]));

  console.log(`  ✓ Created ${skills.length} skills`);

  // ── Companies ────────────────────────────────────────────
  const companyData = [
    {
      name: "Google",
      shortName: "Google",
      category: "Super Dream",
      companyType: "Super Dream",
      incorporationYear: 1998,
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
    },
    {
      name: "Microsoft",
      shortName: "Microsoft",
      category: "Super Dream",
      companyType: "Super Dream",
      incorporationYear: 1975,
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
    },
    {
      name: "Amazon",
      shortName: "Amazon",
      category: "Super Dream",
      companyType: "Super Dream",
      incorporationYear: 1994,
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
    },
    {
      name: "Flipkart",
      shortName: "Flipkart",
      category: "Dream",
      companyType: "Dream",
      incorporationYear: 2007,
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
    },
    {
      name: "TCS",
      shortName: "TCS",
      category: "Standard",
      companyType: "Regular",
      incorporationYear: 1968,
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
    },
  ];

  const companies = await Promise.all(
    companyData.map((c) => prisma.company.create({ data: c })),
  );

  const companyMap = new Map(companies.map((c) => [c.name, c]));

  console.log(`  ✓ Created ${companies.length} companies`);

  // ── Company Profiles ─────────────────────────────────────
  const profileData = [
    {
      companyId: companyMap.get("Google")!.id,
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
    {
      companyId: companyMap.get("Microsoft")!.id,
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
  ];

  for (const profile of profileData) {
    await prisma.companyProfile.create({ data: profile });
  }

  console.log(`  ✓ Created ${profileData.length} company profiles`);

  // ── Company Skill Requirements ───────────────────────────
  const googleId = companyMap.get("Google")!.id;
  const microsoftId = companyMap.get("Microsoft")!.id;

  const reqData = [
    { companyId: googleId, skillId: skillMap.get("Data Structures & Algorithms")!.id, requiredLevel: 9, criticality: SkillCriticality.Critical, proficiencyLevel: 8 },
    { companyId: googleId, skillId: skillMap.get("System Design")!.id, requiredLevel: 8, criticality: SkillCriticality.Critical, proficiencyLevel: 7 },
    { companyId: googleId, skillId: skillMap.get("Python")!.id, requiredLevel: 7, criticality: SkillCriticality.Important, proficiencyLevel: 6 },
    { companyId: googleId, skillId: skillMap.get("JavaScript")!.id, requiredLevel: 5, criticality: SkillCriticality.Baseline, proficiencyLevel: 5 },
    { companyId: googleId, skillId: skillMap.get("Machine Learning")!.id, requiredLevel: 6, criticality: SkillCriticality.Important, proficiencyLevel: 5 },
    { companyId: microsoftId, skillId: skillMap.get("Data Structures & Algorithms")!.id, requiredLevel: 8, criticality: SkillCriticality.Critical, proficiencyLevel: 7 },
    { companyId: microsoftId, skillId: skillMap.get("System Design")!.id, requiredLevel: 7, criticality: SkillCriticality.Important, proficiencyLevel: 6 },
    { companyId: microsoftId, skillId: skillMap.get("C++")!.id, requiredLevel: 6, criticality: SkillCriticality.Important, proficiencyLevel: 5 },
    { companyId: microsoftId, skillId: skillMap.get("TypeScript")!.id, requiredLevel: 7, criticality: SkillCriticality.Important, proficiencyLevel: 6 },
    { companyId: microsoftId, skillId: skillMap.get("Cloud Computing (AWS)")!.id, requiredLevel: 5, criticality: SkillCriticality.Baseline, proficiencyLevel: 4 },
  ];

  for (const req of reqData) {
    await prisma.companySkillRequirement.create({ data: req });
  }

  console.log(`  ✓ Created ${reqData.length} company skill requirements`);

  // ── Skill Topics ─────────────────────────────────────────
  const dsaId = skillMap.get("Data Structures & Algorithms")!.id;
  const pythonId = skillMap.get("Python")!.id;

  const topicData = [
    // DSA topics (levels 1-10)
    { skillId: dsaId, levelNumber: 1, topicName: "Arrays & Strings", description: "Basic array operations, string manipulation" },
    { skillId: dsaId, levelNumber: 2, topicName: "Linked Lists", description: "Singly, doubly, circular linked lists" },
    { skillId: dsaId, levelNumber: 3, topicName: "Stacks & Queues", description: "LIFO/FIFO data structures, monotonic stacks" },
    { skillId: dsaId, levelNumber: 4, topicName: "Trees & Graphs", description: "BST, AVL, BFS/DFS traversal" },
    { skillId: dsaId, levelNumber: 5, topicName: "Dynamic Programming", description: "Memoization, tabulation, DP patterns" },
    { skillId: dsaId, levelNumber: 6, topicName: "Greedy Algorithms", description: "Interval scheduling, Huffman coding" },
    { skillId: dsaId, levelNumber: 7, topicName: "Graph Algorithms", description: "Dijkstra, Floyd-Warshall, Topological sort" },
    { skillId: dsaId, levelNumber: 8, topicName: "Advanced Data Structures", description: "Trie, Segment Tree, Fenwick Tree" },
    { skillId: dsaId, levelNumber: 9, topicName: "Network Flow & Matching", description: "Ford-Fulkerson, Edmonds-Karp, Bipartite matching" },
    { skillId: dsaId, levelNumber: 10, topicName: "Competitive Programming", description: "Advanced problem-solving techniques" },
    // Python topics (levels 1-10)
    { skillId: pythonId, levelNumber: 1, topicName: "Python Basics", description: "Variables, data types, control flow" },
    { skillId: pythonId, levelNumber: 2, topicName: "Functions & Modules", description: "Function definitions, module imports" },
    { skillId: pythonId, levelNumber: 3, topicName: "OOP in Python", description: "Classes, inheritance, polymorphism" },
    { skillId: pythonId, levelNumber: 4, topicName: "File I/O & Exceptions", description: "File handling, try/except/finally" },
    { skillId: pythonId, levelNumber: 5, topicName: "Advanced Python", description: "Decorators, generators, context managers" },
    { skillId: pythonId, levelNumber: 6, topicName: "Concurrency", description: "Threading, asyncio, multiprocessing" },
    { skillId: pythonId, levelNumber: 7, topicName: "Testing & Debugging", description: "unittest, pytest, logging" },
    { skillId: pythonId, levelNumber: 8, topicName: "Web Frameworks", description: "FastAPI, Django, Flask" },
    { skillId: pythonId, levelNumber: 9, topicName: "Data Science Stack", description: "NumPy, Pandas, Matplotlib" },
    { skillId: pythonId, levelNumber: 10, topicName: "Production Python", description: "Packaging, deployment, monitoring" },
  ];

  for (const topic of topicData) {
    await prisma.skillTopic.create({ data: topic });
  }

  console.log(`  ✓ Created ${topicData.length} skill topics`);

  // ── Student Skills (self-assessment) ─────────────────────
  await prisma.studentSkill.createMany({
    data: [
      { userId: studentUser.id, skillId: skillMap.get("Python")!.id, currentLevel: 7 },
      { userId: studentUser.id, skillId: skillMap.get("JavaScript")!.id, currentLevel: 6 },
      { userId: studentUser.id, skillId: skillMap.get("Data Structures & Algorithms")!.id, currentLevel: 5 },
      { userId: studentUser.id, skillId: skillMap.get("React")!.id, currentLevel: 4 },
      { userId: studentUser.id, skillId: skillMap.get("SQL")!.id, currentLevel: 6 },
    ],
  });

  console.log("  ✓ Created student skill assessments");

  // ── Student Target Companies ─────────────────────────────
  await prisma.studentTargetCompany.createMany({
    data: [
      { userId: studentUser.id, companyId: companyMap.get("Google")!.id, isFavorited: true },
      { userId: studentUser.id, companyId: companyMap.get("Microsoft")!.id, isFavorited: true },
      { userId: studentUser.id, companyId: companyMap.get("Flipkart")!.id, isFavorited: false },
    ],
  });

  console.log("  ✓ Created student target company preferences");

  // ── Summary ──────────────────────────────────────────
  const counts = {
    users: await prisma.user.count(),
    companies: await prisma.company.count(),
    profiles: await prisma.companyProfile.count(),
    skills: await prisma.skill.count(),
    requirements: await prisma.companySkillRequirement.count(),
    topics: await prisma.skillTopic.count(),
    studentSkills: await prisma.studentSkill.count(),
    targets: await prisma.studentTargetCompany.count(),
  };

  console.log("\n📊 Seed Summary:");
  for (const [key, value] of Object.entries(counts)) {
    console.log(`  ${key}: ${value}`);
  }
  console.log("\n✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
