# Isolated Lingo build

The `lingo-e2e` Vite mode uses `wrangler.lingo-e2e.jsonc`. The fixed Worker name is `jupiter-i18n-lingo-e2e`. The fixed private account is `267eec222a3650d37a3129a967a3f298`.

The mode writes server and client files to `dist-lingo-e2e`. A normal build still writes to `dist` and selects the original pilot Worker. The separate config has no bindings, routes, or scheduled triggers. It does not import the pilot or scheduler config.

## Local checks

Run `pnpm run verify:lingo-e2e:dry-run` to build the isolated target and check its Worker package without deployment. Run `pnpm run build` to check the normal target.

On 2026-09-07, both builds passed from fixed point `4fcd1e00d7d22e7af6c49f8b15660232f6efe925` with the local isolated-build changes. The isolated dry run reported `No bindings found` and `--dry-run: exiting now`.

Direct checks of both generated `server/wrangler.json` files passed:

- The isolated output names `jupiter-i18n-lingo-e2e` and the fixed private account.
- The normal output names `jupiter-i18n-translation-pilot` and has no account override.
- Each generated config points to its own source config.
- Each output directory contains its own `server/index.js`.
- After removal of target names, account, and source config paths, the two generated configs are equal.

The implementation uses the installed `@cloudflare/vite-plugin` 1.54.0 `configPath` option. Its output directory contract and the installed TanStack Start output directory contract both use `build.outDir` as the root. The real builds confirmed this contract. No wrapper or replacement config parser was added.

## Local runtime

After the isolated build, use `pnpm run preview:lingo-e2e`. This command selects the generated isolated config explicitly and uses the local runtime only. Do not use `vite preview --mode lingo-e2e` for this check: after a normal build, its shared Wrangler redirect can select the normal pilot output.

An explicit local Wrangler session on port 14329 passed the runtime check. The Local Explorer API identified the current Worker (`isSelf: true`) as `jupiter-i18n-lingo-e2e`, with empty binding lists. English and Simplified Chinese requests each returned HTTP 200, the expected document language, and the correct rendered `Review swap` translation. This check used the existing baseline translations, not a new Lingo result.

The checked command was `pnpm exec wrangler dev --config dist-lingo-e2e/server/wrangler.json --local --ip 127.0.0.1 --port 14329 --inspector-port 14330`. The checks used `/cdn-cgi/local/explorer/api/local/workers`, `/?locale=en&page=swap`, and `/?locale=zh-Hans&page=swap`. The local server was stopped after the checks.

Formatting, lint, and type checks passed. Type generation was required in this new checkout before the type check. The existing suite passed all 204 tests with `pnpm test --maxWorkers=2 --testTimeout=30000`. Two earlier runs exceeded the existing 5-second limit in one CLI test. No test or timeout configuration was changed in the repository.

This is preparation only. No Worker was deployed, no route was changed, and no translation job was started by these checks. A deployment still needs explicit approval. The local dry run does not prove account access or a live site.
