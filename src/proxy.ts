import { NextResponse, type NextRequest } from "next/server";

/**
 * Content Security Policy with a fresh nonce per request: the browser only runs scripts that
 * carry the nonce (Next.js adds it to its own scripts while rendering) and, through
 * 'strict-dynamic', the scripts those load (e.g. the YouTube IFrame API on /proyeccion). An
 * injected <script> or inline event handler does not run. Inline style *attributes* stay
 * allowed (React sets them; they cannot run code), <style>/<link> elements need the nonce
 * or a trusted origin.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";
  const projection = request.nextUrl.pathname === "/proyeccion";

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com${isDev ? " 'unsafe-inline'" : ""}`,
    "style-src-attr 'unsafe-inline'",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob:${projection ? " https://i.ytimg.com" : ""}`,
    "connect-src 'self'",
    // Only the projection screen embeds anything (YouTube); the rest of the platform, nothing.
    `frame-src ${projection ? "https://www.youtube.com https://www.youtube-nocookie.com" : "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ];
  const csp = directives.join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: API routes answer JSON (their CSP is set in next.config.ts) and static
      // assets need none.
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
