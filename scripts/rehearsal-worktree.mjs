import { execFileSync } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export async function withRehearsalWorktree(prefix, action) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), prefix));
  const worktree = join(temporaryRoot, "worktree");
  const candidate = read("git", ["stash", "create"]) || "HEAD";

  try {
    run("git", ["worktree", "add", "--detach", worktree, candidate]);
    await symlink(resolve("node_modules"), join(worktree, "node_modules"), "dir");
    await action(worktree);
  } finally {
    try {
      run("git", ["worktree", "remove", "--force", worktree]);
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  }
}

export function run(command, args, cwd = process.cwd()) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function read(command, args) {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}
