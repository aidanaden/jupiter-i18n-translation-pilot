# Existing pilot build boundary

On 7 September 2026, the owner approved disabling non-production builds for `jupiter-i18n-translation-pilot` in private account `267eec222a3650d37a3129a967a3f298`.

The setting was changed in the Cloudflare dashboard and saved. A page reload showed `Builds for non-production branches` unchecked. The production branch remains `main`. The build command remains `pnpm run build`. The deployment command remains `pnpm exec wrangler deploy --config dist/server/wrangler.json`.

This change stops automatic builds for every non-production branch of this existing Worker, not only Lingo branches. It does not remove saved versions. It does not change a Worker runtime setting, either scheduler, or the production branch.

A read-only deployment list through the retained private-account login still showed the existing pilot at version `7a3e324a-3401-4d51-a00a-5ae5c3bf3b4d`, deployed on 5 September. A separate read for `jupiter-i18n-lingo-e2e` returned Cloudflare 10007, Worker not found. No new Worker was deployed.

The test branch can now be pushed without this automatic upload path. The separate test Worker still needs its final deployment approval. This receipt does not claim that the live review, translation, reset, or full recording has passed.
