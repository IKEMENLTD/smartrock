// NextAuth ハンドラ (Auth.js v4 / App Router)

import NextAuth from "next-auth";
import { authOptions } from "@/server/auth/options";

export const runtime = "nodejs";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
