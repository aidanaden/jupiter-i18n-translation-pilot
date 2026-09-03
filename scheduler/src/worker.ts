import type { CanaryOutcome, SchedulerHealth } from "./scheduler-service";

type SchedulerHealthReader = {
  getHealth: () => Promise<SchedulerHealth>;
};

type SchedulerCanaryTrigger = {
  triggerCanary: (now: number) => Promise<CanaryOutcome>;
};

type SchedulerWatchdog = {
  ensureArmed: (now: number) => Promise<void>;
};

export async function armScheduler({
  credentialsReady,
  scheduler,
  scheduledTime,
}: {
  credentialsReady: boolean;
  scheduler: SchedulerWatchdog;
  scheduledTime: number;
}): Promise<void> {
  if (!credentialsReady) {
    return;
  }

  await scheduler.ensureArmed(scheduledTime);
}

export async function handleSchedulerRequest({
  canaryToken,
  credentialsReady,
  now,
  request,
  scheduler,
}: {
  canaryToken: string | undefined;
  credentialsReady: boolean;
  now: () => number;
  request: Request;
  scheduler: SchedulerCanaryTrigger & SchedulerHealthReader;
}): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") {
    return Response.json(await scheduler.getHealth(), {
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (request.method !== "POST" || url.pathname !== "/canary") {
    return new Response("Not found", { status: 404 });
  }

  if (!canaryToken || !credentialsReady) {
    return new Response("Canary unavailable", {
      headers: { "Cache-Control": "no-store" },
      status: 503,
    });
  }

  if (!matchesBearerToken(request.headers.get("Authorization"), canaryToken)) {
    return new Response("Unauthorized", {
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": "Bearer",
      },
      status: 401,
    });
  }

  const outcome = await scheduler.triggerCanary(now());
  return Response.json(outcome, {
    headers: { "Cache-Control": "no-store" },
    status: outcome.kind === "busy" ? 409 : 202,
  });
}

function matchesBearerToken(authorization: string | null, token: string): boolean {
  if (authorization === null) {
    return false;
  }

  const expected = `Bearer ${token}`;
  if (authorization.length !== expected.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= authorization.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}
