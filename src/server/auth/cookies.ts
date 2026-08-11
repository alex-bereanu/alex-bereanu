import { env } from "@/config/env";

export function getSecureCookieOptions(maxAge: number, sameSite: "strict" | "lax" = "strict") {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite,
    path: "/",
    priority: "high" as const,
    maxAge,
  };
}
