import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const p = new PrismaClient();
async function main() {
  const hash = await bcrypt.hash("Admin@123", 12);
  const user = await p.user.upsert({
    where: { email: "admin@kits.com" },
    create: { email: "admin@kits.com", passwordHash: hash, name: "Placement Admin", role: "admin" },
    update: { passwordHash: hash, name: "Placement Admin", role: "admin" },
  });
  console.log("Admin created:", user.email, user.userId);
  await p.$disconnect();
}
main();
