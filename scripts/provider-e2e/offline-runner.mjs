import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { createCompiledCatalog } from "@lingui/cli/api";
import { setupI18n } from "@lingui/core";
import { formatter } from "@lingui/format-po";
import { I18nProvider, Trans } from "@lingui/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as z from "zod/v4-mini";

const fixtureSchema = z.strictObject({
  sourcePo: z.string().check(z.minLength(1)),
  targetPo: z.string().check(z.minLength(1)),
  glossary: z.strictObject({
    revision: z.string().check(z.minLength(1)),
    status: z.literal("OFFLINE CANDIDATE. NOT HUMAN APPROVED."),
    locale: z.literal("zh-Hans"),
    terms: z
      .array(
        z.strictObject({
          source: z.string().check(z.minLength(1)),
          target: z.string().check(z.minLength(1)),
          ids: z.array(z.string().check(z.minLength(1))).check(z.minLength(1)),
        }),
      )
      .check(z.minLength(1)),
  }),
});

export async function readOfflineFixture() {
  const [sourcePo, targetPo, glossary] = await Promise.all(
    ["en.po", "zh-Hans.po", "glossary.json"].map((name) =>
      readFile(new URL(`./fixtures/v1/${name}`, import.meta.url), "utf8"),
    ),
  );
  return { sourcePo, targetPo, glossary: JSON.parse(glossary) };
}

function compileCatalog(po, locale) {
  if (!po.includes(`"Language: ${locale}\\n"`)) throw new Error("Wrong PO language header");
  const catalog = formatter({ explicitIdAsDefault: true }).parse(po, {
    filename: `${locale}.po`,
    locale,
    sourceLocale: "en",
  });
  if ([...po.matchAll(/^msgid /gm)].length !== Object.keys(catalog).length + 1)
    throw new Error("Duplicate or malformed PO IDs");
  const messages = Object.fromEntries(
    Object.entries(catalog).map(([id, entry]) => {
      if (!entry.translation?.trim() || entry.obsolete)
        throw new Error(`${id}: missing translation`);
      return [id, entry.translation];
    }),
  );
  const compiled = createCompiledCatalog(locale, messages, { strict: true, namespace: "json" });
  if (compiled.errors.length) throw new Error(`Invalid ICU: ${compiled.errors[0].id}`);
  return { catalog, compiled: JSON.parse(compiled.source).messages };
}

function messageArguments(tokens, result = new Set(), branchPath = [], insidePlural = false) {
  if (insidePlural) {
    result.add(
      JSON.stringify(["plural-number", branchPath, tokens.filter((token) => token === "#").length]),
    );
  }
  for (const token of tokens) {
    if (!Array.isArray(token)) continue;
    const [name, type = "argument", choices] = token;
    const branches = ["plural", "select", "selectordinal"].includes(type);
    const keys = branches ? Object.keys(choices).filter((key) => key !== "offset") : [];
    const requiredChoices = type === "select" ? keys : keys.filter((key) => /^=?\d+$/.test(key));
    result.add(
      JSON.stringify([
        name,
        type,
        requiredChoices.sort(),
        branches ? (choices.offset ?? 0) : choices,
      ]),
    );
    for (const key of keys) {
      const plural = type === "plural" || type === "selectordinal";
      const branch = plural && !/^=?\d+$/.test(key) ? "*" : key;
      messageArguments(
        choices[key],
        result,
        [...branchPath, [name, type, branch]],
        plural || insidePlural,
      );
    }
  }
  return [...result].sort();
}

function richTags(message) {
  const stack = [];
  const tags = [];
  for (const match of message.matchAll(/<[^>]*>|[<>]/g)) {
    const tag = /^<(\/)?(link|strong)>$/.exec(match[0]);
    if (!tag) throw new Error("Unsafe rich tag");
    if (tag[1]) {
      if (stack.pop() !== tag[2]) throw new Error("Unbalanced rich tag");
    } else {
      stack.push(tag[2]);
      tags.push(tag[2]);
    }
  }
  if (stack.length) throw new Error("Unbalanced rich tag");
  return tags.sort();
}

export function validateCatalogs({ sourcePo, targetPo, glossary }) {
  const source = compileCatalog(sourcePo, "en");
  const target = compileCatalog(targetPo, "zh-Hans");
  const ids = Object.keys(source.catalog).sort();
  if (ids.length < 12 || ids.length > 20) throw new Error("Fixture must have 12 to 20 messages");
  if (JSON.stringify(ids) !== JSON.stringify(Object.keys(target.catalog).sort()))
    throw new Error("Catalog IDs differ");
  for (const id of ids) {
    if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(id))
      throw new Error(`${id}: invalid semantic ID`);
    const original = source.catalog[id];
    const translated = target.catalog[id];
    if (
      JSON.stringify(original.comments) !== JSON.stringify(translated.comments) ||
      original.context !== translated.context
    ) {
      throw new Error(`${id}: message context differs`);
    }
    if (
      JSON.stringify(messageArguments(source.compiled[id])) !==
      JSON.stringify(messageArguments(target.compiled[id]))
    ) {
      throw new Error(`${id}: ICU arguments differ`);
    }
    if (
      JSON.stringify(richTags(original.translation)) !==
      JSON.stringify(richTags(translated.translation))
    ) {
      throw new Error(`${id}: rich tags differ`);
    }
  }
  for (const term of glossary.terms) {
    for (const id of term.ids) {
      if (
        !source.catalog[id]?.translation.includes(term.source) ||
        !target.catalog[id]?.translation.includes(term.target)
      ) {
        throw new Error(`${id}: required glossary term differs`);
      }
    }
  }
  return target.compiled;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function createOfflineRunner(baseline) {
  const initial = z.parse(fixtureSchema, baseline);
  let candidate;
  let deployed = { input: structuredClone(initial), compiled: validateCatalogs(initial) };
  let deployedHead = "offline-baseline";
  let sequence = 0;

  function submit(input) {
    const parsed = z.parse(fixtureSchema, input);
    sequence += 1;
    candidate = {
      input: parsed,
      head: digest(JSON.stringify({ sequence, input: parsed })),
    };
    return candidate.head;
  }

  return {
    submit,
    sync(input) {
      const parsed = z.parse(fixtureSchema, input);
      if (
        deployedHead !== "offline-baseline" &&
        parsed.sourcePo === deployed.input.sourcePo &&
        JSON.stringify(parsed.glossary) === JSON.stringify(deployed.input.glossary)
      ) {
        if (parsed.targetPo !== deployed.input.targetPo)
          throw new Error("Provider correction freeze blocks overwrite");
        return deployedHead;
      }
      return submit(parsed);
    },
    correct({ actor, head, targetPo }) {
      if (actor !== "simulated-zh-reviewer") throw new Error("Wrong simulated reviewer");
      if (!candidate || candidate.head !== head) throw new Error("Stale candidate head");
      return submit({ ...candidate.input, targetPo });
    },
    validate(head) {
      if (!candidate || candidate.head !== head) throw new Error("Stale candidate head");
      candidate.compiled = validateCatalogs(candidate.input);
      return head;
    },
    approve({ actor, locale, head }) {
      if (actor !== "simulated-zh-reviewer") throw new Error("Wrong simulated reviewer");
      if (locale !== "zh-Hans") throw new Error("Wrong review locale");
      if (!candidate || candidate.head !== head) throw new Error("Stale candidate head");
      candidate.approval = { actor, locale, head };
    },
    release({ actor, head }) {
      if (actor !== "simulated-maintainer") throw new Error("Wrong simulated maintainer");
      if (!candidate || candidate.head !== head) throw new Error("Stale candidate head");
      if (!candidate.approval) throw new Error("Missing language approval");
      if (!candidate.compiled) throw new Error("Missing catalog validation");
      deployedHead = head;
      deployed = structuredClone(candidate);
    },
    reset({ actor, deployedHead: expectedHead }) {
      if (actor !== "simulated-maintainer") throw new Error("Wrong simulated maintainer");
      if (expectedHead !== deployedHead) throw new Error("Stale deployed head");
      deployed = { input: structuredClone(initial), compiled: validateCatalogs(initial) };
      deployedHead = "offline-baseline";
      candidate = undefined;
    },
    render(id, values = {}) {
      if (!Object.hasOwn(deployed.compiled, id)) throw new Error(`Unknown message: ${id}`);
      const i18n = setupI18n({ locale: "zh-Hans", messages: { "zh-Hans": deployed.compiled } });
      return renderToStaticMarkup(
        createElement(
          I18nProvider,
          { i18n },
          createElement(Trans, {
            id,
            values,
            components: {
              link: createElement("a", { href: "/offline-details" }),
              strong: createElement("strong"),
            },
          }),
        ),
      );
    },
    status() {
      let state = "baseline";
      if (candidate) {
        state = candidate.compiled ? "validated-draft" : "draft";
        if (candidate.approval) state = candidate.compiled ? "ready" : "approved";
        if (candidate.head === deployedHead) state = "released";
      }
      return {
        mode: "OFFLINE SIMULATED",
        state,
        deployedHead,
        baselineHash: digest(JSON.stringify(initial)),
        deployedHash: digest(JSON.stringify(deployed.input)),
        deployedTargetHash: digest(deployed.input.targetPo),
        candidate: candidate
          ? {
              head: candidate.head,
              sourceHash: digest(candidate.input.sourcePo),
              targetHash: digest(candidate.input.targetPo),
              glossaryHash: digest(JSON.stringify(candidate.input.glossary)),
              approval: candidate.approval ? { ...candidate.approval } : null,
              validatedHead: candidate.compiled ? candidate.head : null,
            }
          : null,
      };
    },
  };
}
