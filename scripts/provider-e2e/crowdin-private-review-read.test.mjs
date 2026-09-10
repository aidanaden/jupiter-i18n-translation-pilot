import { expect, it, vi } from "vitest";

import { checkPrivateReview } from "./crowdin-private-review-check.mjs";
import {
  collectPrivateReviewSnapshot,
  MissingCurrentReviewApprovalError,
} from "./crowdin-private-review-read.mjs";

function syntheticApi(change = () => {}) {
  const labels = [
    ["balance", "Balance {balance}", "余额 {balance}"],
    ["limit", "Limit", "限价"],
    ["market", "Market", "市价"],
    ["pay", "You pay", "您支付"],
    ["receive", "You receive", "您将收到"],
    ["recurring", "Recurring", "定期"],
  ];
  const sources = labels.map(([key, text], index) => ({
    id: index + 1,
    projectId: 929237,
    fileId: 36,
    identifier: `swap.form.${key}`,
    text,
    createdAt: "2026-09-11T01:00:00Z",
    updatedAt: null,
  }));
  for (let index = 0; index < 13; index += 1) {
    sources.push({
      ...sources[0],
      id: index + 100,
      identifier: `synthetic.existing.${index}`,
      text: "Synthetic existing source",
    });
  }
  const records = {
    "/projects/929237": {
      id: 929237,
      identifier: "jupiter-ai-private-20260911",
      visibility: "private",
      sourceLanguageId: "en",
      targetLanguageIds: ["zh-CN"],
    },
    "/projects/929237/files/36": {
      id: 36,
      projectId: 929237,
      name: "messages.po",
      revisionId: 1,
      branchId: 26,
      directoryId: 4,
    },
    "/projects/929237/branches/26": {
      id: 26,
      name: "aidan.crowdin-private-recording-base-20260911",
    },
    "/projects/929237/strings": sources,
    "/projects/929237/languages/zh-CN/translations": labels.map(([, , text], index) => ({
      stringId: index + 1,
      translationId: index + 21,
      text,
      contentType: "text/plain",
      user: { id: 1000 },
      createdAt: "2026-09-11T01:01:00Z",
    })),
    "/projects/929237/approvals": labels.map((_, index) => ({
      id: index + 31,
      stringId: index + 1,
      translationId: index + 21,
      user: { id: 17853021 },
      languageId: "zh-CN",
      createdAt: "2026-09-11T01:02:00Z",
    })),
  };
  ["src", "i18n", "locales", "en"].forEach((name, index) => {
    records[`/projects/929237/directories/${index + 1}`] = {
      id: index + 1,
      name,
      branchId: 26,
      directoryId: index || null,
    };
  });
  return async (url, options) => {
    expect(new URL(url).origin).toBe("https://api.crowdin.com");
    expect(options).toMatchObject({ method: "GET", redirect: "error" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const parsed = new URL(url);
    const path = parsed.pathname.replace("/api/v2", "");
    const data = structuredClone(records[path]);
    change(data, path);
    return Response.json(
      Array.isArray(data)
        ? {
            data: data.map((item) => ({ data: item })),
            pagination: { limit: 100, offset: Number(parsed.searchParams.get("offset")) },
          }
        : { data },
    );
  };
}

const now = () => "2026-09-11T01:03:00Z";

it.each([
  "missing translation",
  "missing source",
  "plural",
  "duplicate approval",
  "missing approval",
])("reports missing review only when the current translation exists: %s", async (failure) => {
  const error = await collectPrivateReviewSnapshot({
    token: "synthetic-token",
    now,
    fetchImpl: syntheticApi((data, path) => {
      if (failure === "missing translation" && path.endsWith("/translations")) data.shift();
      if (failure === "missing source" && path.endsWith("/strings")) data[0].identifier = "other";
      if (failure === "plural" && path.endsWith("/translations")) {
        const value = data[0];
        data[0] = {
          stringId: value.stringId,
          contentType: "text/plain",
          plurals: [{ ...value, pluralForm: "other" }],
        };
      }
      if (failure === "duplicate approval" && path.endsWith("/approvals"))
        data.push({ ...data[0], id: 999 });
      if (failure === "missing approval" && path.endsWith("/approvals")) data.shift();
    }),
  }).catch((value) => value);
  expect(error).toBeInstanceOf(Error);
  expect(error instanceof MissingCurrentReviewApprovalError).toBe(failure === "missing approval");
});

it("rejects a selected translation with an unsupported content type", async () => {
  await expect(
    collectPrivateReviewSnapshot({
      token: "synthetic-token",
      now,
      fetchImpl: syntheticApi((data, path) => {
        if (path.endsWith("/translations")) data[0].contentType = "text/html";
      }),
    }),
  ).rejects.toThrow(/content type/);
});

it("maps 19 synthetic sources to six current approved translations without delivery authority", async () => {
  const result = await collectPrivateReviewSnapshot({
    token: "synthetic-token",
    fetchImpl: syntheticApi(),
    now,
  });
  expect(result.first.entries).toHaveLength(6);
  expect(result.first.entries[0]).toMatchObject({
    identifier: "swap.form.balance",
    stringId: 1,
    translationId: 21,
    approvalId: 31,
    sourceUpdatedAt: "2026-09-11T01:00:00Z",
  });
  expect(checkPrivateReview(result)).toMatchObject({
    reviewedMessages: 6,
    deliveryAllowed: false,
    humanApprovalProved: false,
  });
});

it("stops a request that does not respond to its abort signal", async () => {
  vi.useFakeTimers();
  try {
    const result = collectPrivateReviewSnapshot({
      token: "synthetic-token",
      fetchImpl: () => new Promise(() => {}),
      now,
    });
    const rejected = expect(result).rejects.toThrow(/read failed/);
    await vi.advanceTimersByTimeAsync(15001);
    await rejected;
  } finally {
    vi.useRealTimers();
  }
});

it.each([
  ["missing approval", "/approvals", (data) => data.pop()],
  [
    "wrong reviewer",
    "/approvals",
    (data) => {
      data[0].user.id = 1;
    },
  ],
  [
    "old translation approval",
    "/approvals",
    (data) => {
      data[0].translationId = 999;
    },
  ],
  [
    "wrong project",
    "/projects/929237",
    (data) => {
      data.id = 927431;
    },
  ],
  [
    "wrong slug",
    "/projects/929237",
    (data) => {
      data.identifier = "old-project";
    },
  ],
  [
    "public project",
    "/projects/929237",
    (data) => {
      data.visibility = "public";
    },
  ],
  [
    "wrong file",
    "/files/36",
    (data) => {
      data.id = 14;
    },
  ],
  [
    "wrong branch",
    "/branches/26",
    (data) => {
      data.name = "main";
    },
  ],
  [
    "wrong directory",
    "/directories/4",
    (data) => {
      data.name = "fr";
    },
  ],
  [
    "extra parent",
    "/directories/1",
    (data) => {
      data.directoryId = 8;
    },
  ],
  ["missing source", "/strings", (data) => data.pop()],
  [
    "duplicate source",
    "/strings",
    (data) => {
      data[1] = data[0];
    },
  ],
  [
    "changed source",
    "/strings",
    (data) => {
      data[0].text = "Unexpected";
    },
  ],
  [
    "unknown translation source",
    "/translations",
    (data) => {
      data[0].stringId = 999;
    },
  ],
  [
    "duplicate translation",
    "/translations",
    (data) => {
      data[1].translationId = data[0].translationId;
    },
  ],
  [
    "lost placeholder",
    "/translations",
    (data) => {
      data[0].text = "余额";
    },
  ],
])("rejects synthetic %s evidence", async (_name, suffix, change) => {
  await expect(
    collectPrivateReviewSnapshot({
      token: "synthetic-token",
      now,
      fetchImpl: syntheticApi((data, path) => {
        if (path.endsWith(suffix)) change(data);
      }),
    }),
  ).rejects.toThrow();
});

it("rejects a source revision change within a read", async () => {
  let revision = 0;
  await expect(
    collectPrivateReviewSnapshot({
      token: "synthetic-token",
      now,
      fetchImpl: syntheticApi((data, path) => {
        if (path.endsWith("/files/36")) data.revisionId = ++revision;
      }),
    }),
  ).rejects.toThrow(/file changed/);
});

it("rejects approval changes between reads", async () => {
  let reads = 0;
  await expect(
    collectPrivateReviewSnapshot({
      token: "synthetic-token",
      now,
      fetchImpl: syntheticApi((data, path) => {
        if (path.endsWith("/approvals") && ++reads === 2) data[0].id = 999;
      }),
    }),
  ).rejects.toThrow(/changed/);
});

it.each([403, 404, 302])(
  "rejects HTTP %s without response or credential details",
  async (status) => {
    await expect(
      collectPrivateReviewSnapshot({
        token: "synthetic-secret",
        now,
        fetchImpl: async () => new Response("synthetic-secret", { status }),
      }),
    ).rejects.toThrow("Native read failed. No response details were recorded.");
  },
);

it("rejects an oversized response", async () => {
  await expect(
    collectPrivateReviewSnapshot({
      token: "synthetic-token",
      now,
      fetchImpl: async () => new Response("x".repeat(1000001)),
    }),
  ).rejects.toThrow(/read failed/);
});

it("rejects invalid pagination", async () => {
  const base = syntheticApi();
  await expect(
    collectPrivateReviewSnapshot({
      token: "synthetic-token",
      now,
      fetchImpl: async (url, options) => {
        const response = await base(url, options);
        const body = await response.json();
        if (body.pagination) body.pagination.offset = 100;
        return Response.json(body);
      },
    }),
  ).rejects.toThrow();
});

it("stops at the page bound when synthetic pages never end", async () => {
  const base = syntheticApi();
  await expect(
    collectPrivateReviewSnapshot({
      token: "synthetic-token",
      now,
      fetchImpl: async (url, options) => {
        const response = await base(url, options);
        const body = await response.json();
        if (body.pagination) {
          const offset = Number(new URL(url).searchParams.get("offset"));
          body.data = Array.from({ length: 100 }, (_, index) => ({
            data: {
              ...body.data[0].data,
              id: offset + index + 1,
              identifier: `synthetic.source.${offset + index}`,
            },
          }));
        }
        return Response.json(body);
      },
    }),
  ).rejects.toThrow(/pagination bound/);
});

it("bounds the time spent reading a stalled response body", async () => {
  vi.useFakeTimers();
  try {
    const result = collectPrivateReviewSnapshot({
      token: "synthetic-token",
      now,
      fetchImpl: async () => new Response(new ReadableStream()),
    });
    const rejected = expect(result).rejects.toThrow(/read failed/);
    await vi.advanceTimersByTimeAsync(15001);
    await rejected;
  } finally {
    vi.useRealTimers();
  }
});

it.each(["file", "branch"])("rejects an old native %s", async (kind) => {
  await expect(
    collectPrivateReviewSnapshot({
      token: "synthetic-token",
      now,
      fetchImpl: syntheticApi((data, path) => {
        if (path.endsWith("/files/36")) {
          if (kind === "file") data.id = 24;
          else data.branchId = 9;
        }
      }),
    }),
  ).rejects.toThrow();
});
