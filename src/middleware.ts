import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional HTTP Basic Auth for the whole site. The app has no accounts, so set
 * VI_BASIC_AUTH_USER and VI_BASIC_AUTH_PASSWORD whenever it is reachable from the internet
 * (e.g. on Render). Unset, every request passes through unchanged.
 */
export function middleware(req: NextRequest) {
  const user = process.env.VI_BASIC_AUTH_USER;
  const password = process.env.VI_BASIC_AUTH_PASSWORD;
  if (!user || !password) return NextResponse.next();

  const expected = Buffer.from(`Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`);
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  if (given.length === expected.length && timingSafeEqual(given, expected)) return NextResponse.next();

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="VisionInspect", charset="UTF-8"' },
  });
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon).*)"],
};
