import { run, withRehearsalWorktree } from "./rehearsal-worktree.mjs";

await withRehearsalWorktree("jupiter-rehearsal-reset-", async (worktree) => {
  run("node", ["scripts/reset-rehearsal-fixture.mjs", "--write"], worktree);
  run("node", ["scripts/reset-rehearsal-fixture.mjs", "--check"], worktree);
  run("pnpm", ["run", "verify:ssr"], worktree);
  console.log("Rehearsal reset restored and rendered the tagged baseline.");
});
