import { db } from "./src/lib/db";
async function main() {
  try {
    const users = await db.user.findMany();
    console.log("Users:", JSON.stringify(users));
  } catch (e) {
    console.error("Error:", e);
  }
  await db.$disconnect();
}
main();
