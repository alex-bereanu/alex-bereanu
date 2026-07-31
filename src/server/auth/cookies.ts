import { env } from "@/config/env";

export function getSecureCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    priority: "high" as const,
    maxAge,
  };
}
