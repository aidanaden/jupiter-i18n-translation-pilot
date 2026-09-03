import { DurableObject } from "cloudflare:workers";

import { GitHubWorkflowClient } from "./github-client";
import {
  parseSchedulerRecord,
  schedulerRecordSchema,
  type SchedulerRecord,
} from "./scheduler-record";
import { SchedulerService, type CanaryOutcome, type SchedulerHealth } from "./scheduler-service";
import { armScheduler, handleSchedulerRequest } from "./worker";

const RECORD_KEY = "scheduler-record";
const SCHEDULER_NAME = "crowdin-export";

type Env = Omit<SchedulerEnv, "CROWDIN_SCHEDULER"> & {
  CANARY_TRIGGER_TOKEN: string | undefined;
  CROWDIN_SCHEDULER: DurableObjectNamespace<CrowdinExportScheduler>;
  GITHUB_DISPATCH_TOKEN: string | undefined;
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

  async triggerCanary(now: number): Promise<CanaryOutcome> {
    return this.#service().triggerCanary(now);
  }

  #service(): SchedulerService {
    return new SchedulerService({
      github: new GitHubWorkflowClient({
        fetch,
        owner: "aidanaden",
        ref: "main",
        repository: "jupiter-i18n-translation-pilot",
        token: this.#env.GITHUB_DISPATCH_TOKEN,
        workflow: "crowdin-export.yml",
      }),
      storage: new SchedulerStorage(this.ctx.storage),
    });
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    return handleSchedulerRequest({
      canaryToken: env.CANARY_TRIGGER_TOKEN,
      credentialsReady: Boolean(env.GITHUB_DISPATCH_TOKEN),
      now: Date.now,
      request,
      scheduler: env.CROWDIN_SCHEDULER.getByName(SCHEDULER_NAME),
    });
  },
  async scheduled(controller, env, context): Promise<void> {
    context.waitUntil(
      armScheduler({
        credentialsReady: Boolean(env.GITHUB_DISPATCH_TOKEN),
        scheduler: env.CROWDIN_SCHEDULER.getByName(SCHEDULER_NAME),
        scheduledTime: controller.scheduledTime,
      }),
    );
  },
} satisfies ExportedHandler<Env>;
