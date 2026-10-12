// Admin tool: promote or demote a user. Deliberately not an HTTP endpoint: granting staff access
// should require access to the server, not just a valid API call.
// Usage (from apps/api): npm run user:set-role -- <email> <customer|agent>
import { z } from "zod";
import { prisma } from "../db.js";
import { emailField } from "../validation.js";

const argsSchema = z.tuple([emailField, z.enum(["customer", "agent"])]);
const parsed = argsSchema.safeParse(process.argv.slice(2));

if (!parsed.success) {
  console.error("Usage: npm run user:set-role -- <email> <customer|agent>");
  process.exitCode = 1;
} else {
  const [email, role] = parsed.data;
  const result = await prisma.user.updateMany({ where: { email }, data: { role } });
  if (result.count === 0) {
    console.error(`No user with email ${email}`);
    process.exitCode = 1;
  } else {
    // Takes effect on the user's next request: sessions read the role from the users table.
    console.log(`${email} is now: ${role}`);
  }
}

await prisma.$disconnect();
