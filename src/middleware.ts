// 管理画面のサーバ側ガード (NFR-004)。
// /admin/* を NextAuth JWT で保護し、未認証は /admin/login へリダイレクトする。
// (各ページのクライアント側 useAuthGuard に加えた多重防御。管理APIは別途 requireAdminApi で保護)
import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/admin/login",
  },
});

export const config = {
  // /admin 配下のみ保護。/admin/login と NextAuth エンドポイントは除外。
  matcher: ["/admin/((?!login).*)"],
};
