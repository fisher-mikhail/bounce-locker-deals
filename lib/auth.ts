import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

/** Comma-separated list of emails allowed in. Everyone else is refused at sign-in and on every request. */
export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowed(email?: string | null): boolean {
  return !!email && allowedEmails().includes(email.toLowerCase());
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user }) {
      return isAllowed(user.email);
    },
  },
  pages: { error: "/denied" },
};

/** Returns the signed-in, allow-listed user's email, or null. */
export async function currentUser(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;
  return isAllowed(email) ? email!.toLowerCase() : null;
}

/** For API routes: the user's email, or a 401 Response to return. */
export async function requireUser(): Promise<string | Response> {
  const email = await currentUser();
  return email ?? Response.json({ error: "Not authorised" }, { status: 401 });
}
