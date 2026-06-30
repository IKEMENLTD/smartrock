// NextAuth 設定 (design-docs/13, 17 / TBL-014)
// Credentials(email/password) で admin_users を bcrypt 照合。session=jwt、role を session に載せる。

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/lib/prisma";
import { config } from "@/server/lib/config";
import { logger } from "@/server/lib/logger";

export const authOptions: NextAuthOptions = {
  secret: config.auth.secret,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/admin/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim();
        const password = credentials?.password;
        if (!email || !password) return null;

        const admin = await prisma.adminUser.findUnique({ where: { email } });
        if (!admin) {
          logger.warn("admin login: user not found", { email });
          return null;
        }

        const okPw = await bcrypt.compare(password, admin.passwordHash);
        if (!okPw) {
          logger.warn("admin login: bad password", { email });
          return null;
        }

        return {
          id: String(admin.id),
          email: admin.email,
          role: admin.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // authorize の戻り値を JWT に載せる
        token.role = (user as { role?: string }).role ?? "owner";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role =
          (token.role as string) ?? "owner";
      }
      return session;
    },
  },
};
