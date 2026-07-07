import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { token } = req.nextauth;
    const { pathname } = req.nextUrl;

    // Espace admin réservé au rôle ADMIN
    if (pathname.startsWith("/admin") && token?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // authorized = false → redirection vers la page de login
      authorized: ({ token }) => !!token,
    },
    pages: { signIn: "/login" },
  }
);

// Routes protégées (la Match Room reste publique via son token unique)
export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/team/:path*"],
};
