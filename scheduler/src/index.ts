import { DurableObject } from "cloudflare:workers";

import { GitHubWorkflowClient } from "./github-client";
import {
  parseSchedulerRecord,
  schedulerRecordSchema,
  type SchedulerRecord,
} from "./scheduler-record";
import { SchedulerService, type SchedulerHealth } from "./scheduler-service";
import { armScheduler, handleSchedulerRequest } from "./worker";

const RECORD_KEY = "scheduler-record";
const SCHEDULER_NAME = "crowdin-export";

type Env = Omit<SchedulerEnv, "CROWDIN_SCHEDULER"> & {
  CROWDIN_SCHEDULER: DurableObjectNamespace<CrowdinExportScheduler>;
  GITHUB_DISPATCH_TOKEN: string;
};

class SchedulerStorage {
  readonly #storage: DurableObjectStorage;

  constructor(storage: DurableObjectStorage) {
    this.#storage = storage;
  }

  async read(): Promise<SchedulerRecord | null> {
    const input = await this.#storage.get(RECORD_KEY);
    return input === undefined
      ? null
      : parseSchedulerRecord(schedulerRecordSchema.safeParse(input));
  }

  async setAlarm(scheduledTime: number): Promise<void> {
    await this.#storage.setAlarm(scheduledTime);
  }

  async write(record: SchedulerRecord): Promise<void> {
    await this.#storage.put(RECORD_KEY, record);
  }
}

export class CrowdinExportScheduler extends DurableObject<Env> {
  readonly #env: Env;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.#env = env;
  }

  async alarm(): Promise<void> {
    const outcome = await this.#service().handleAlarm(Date.now());
    console.info(JSON.stringify({ event: "crowdin_scheduler_alarm", outcome }));
  }

  async ensureArmed(now: number): Promise<void> {
    await this.#service().ensureArmed(now);
  }

  async getHealth(): Promise<SchedulerHealth> {
    return this.#service().getHealth();
  }

  #service(): SchedulerService {
    return new SchedulerService({
      github: new GitHubWorkflowClient({
        fetch,
        owner: "aidanaden",
        ref: "main",
        repository: "jupiter-i18n-translation-pilot",
        token: parseGitHubToken(this.#env.GITHUB_DISPATCH_TOKEN),
        workflow: "crowdin-export.yml",
      }),
      storage: new SchedulerStorage(this.ctx.storage),
    });
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    return handleSchedulerRequest(request, env.CROWDIN_SCHEDULER.getByName(SCHEDULER_NAME));
  },
  async scheduled(controller, env, context): Promise<void> {
    context.waitUntil(
      armScheduler(env.CROWDIN_SCHEDULER.getByName(SCHEDULER_NAME), controller.scheduledTime),
    );
  },
} satisfies ExportedHandler<Env>;

function parseGitHubToken(input: string): string {
  if (input.length === 0) {
    throw new Error("GITHUB_DISPATCH_TOKEN is missing");
  }

  return input;
}
