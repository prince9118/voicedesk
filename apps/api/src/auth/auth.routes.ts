import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { AppError } from "../errors.js";
import { Prisma } from "../generated/prisma/client.js";
import { emailField, parseInput, textField } from "../validation.js";
import { getDummyHash, hashPassword, verifyPassword } from "./password.js";
import { getAuth, requireAuth } from "./require-auth.js";
import { createSession, deleteSession, publicUserSelect } from "./session.js";

// NIST SP 800-63B: length matters, composition rules ("1 uppercase, 1 symbol") do not.
// The upper bound keeps an attacker from making us hash megabytes.
const newPasswordField = z.string().min(12).max(128);

const registerSchema = z.strictObject({
  email: emailField,
  name: textField(1, 100),
  password: newPasswordField
});

// Login does not enforce the current password policy: an account created under an older
// policy must still be able to log in.
const loginSchema = z.strictObject({
  email: emailField,
  password: z.string().min(1).max(128)
});

export const authRouter = Router();

// POST /api/auth/register: create an account and log it in.
authRouter.post("/register", async (req, res) => {
  const input = parseInput(registerSchema, req.body, "body");
  const passwordHash = await hashPassword(input.password);

  let user;
  try {
    user = await prisma.user.create({
      data: { email: input.email, name: input.name, passwordHash },
      select: publicUserSelect
    });
  } catch (err) {
    // P2002: unique constraint violated. The database, not a prior SELECT, decides, so two
    // simultaneous registrations for the same email cannot both succeed.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new AppError(
        409,
        "EMAIL_TAKEN",
        "An account with this email already exists"
      );
    }
    throw err;
  }

  const session = await createSession(user.id);
  res.status(201).json({
    data: { user, token: session.token, expiresAt: session.expiresAt }
  });
});

// POST /api/auth/login
authRouter.post("/login", async (req, res) => {
  const input = parseInput(loginSchema, req.body, "body");
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...publicUserSelect, passwordHash: true }
  });

  // Same work and the same answer whether the email is unknown or the password is wrong,
  // so neither the message nor the response time reveals which accounts exist.
  const valid = await verifyPassword(
    input.password,
    user?.passwordHash ?? (await getDummyHash())
  );
  if (!user || !valid) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const session = await createSession(user.id);
  res.status(200).json({
    data: {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      token: session.token,
      expiresAt: session.expiresAt
    }
  });
});

// POST /api/auth/logout: revoke the current session. This is what a JWT cannot do.
authRouter.post("/logout", requireAuth, async (req, res) => {
  await deleteSession(getAuth(req).sessionTokenHash);
  res.status(204).end();
});

// GET /api/auth/me
authRouter.get("/me", requireAuth, (req, res) => {
  res.status(200).json({ data: getAuth(req).user });
});
