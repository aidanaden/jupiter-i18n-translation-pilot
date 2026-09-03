import type { SchedulerHealth } from "./scheduler-service";

type SchedulerHealthReader = {
  getHealth: () => Promise<SchedulerHealth>;
};

type SchedulerWatchdog = {
  ensureArmed: (now: number) => Promise<void>;
};

export async function armScheduler(
  scheduler: SchedulerWatchdog,
  scheduledTime: number,
): Promise<void> {
  await scheduler.ensureArmed(scheduledTime);
}

export async function handleSchedulerRequest(
  request: Request,
  scheduler: SchedulerHealthReader,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname !== "/health") {
    return new Response("Not found", { status: 404 });
  }

  return Response.json(await scheduler.getHealth(), {
    headers: { "Cache-Control": "no-store" },
  });
}
