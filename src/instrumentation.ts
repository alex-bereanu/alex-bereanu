import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { emitOperationalEvent } = await import("@/server/observability/events");
  const errorName = error instanceof Error ? error.name : "UnknownError";
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest).slice(0, 160)
      : undefined;

  await emitOperationalEvent({
    kind: "server-error",
    severity: "error",
    data: {
      errorName,
      digest,
      routePath: context.routePath,
      routeType: context.routeType,
      routerKind: context.routerKind,
    },
  });
};
