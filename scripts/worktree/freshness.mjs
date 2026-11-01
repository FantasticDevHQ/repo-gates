import { git, ancestor } from './git.mjs';
export function refresh({ root, base }) {
  if (git(root, 'status', '--porcelain')) throw new Error('Dirty checkout: commit your changes before setup; nothing was stashed or discarded.');
  try { git(root, 'fetch', 'origin', `+refs/heads/${base}:refs/remotes/origin/${base}`); }
  catch { throw new Error('Fetching origin failed; restore remote access before retrying setup.'); }
  const remote = `refs/remotes/origin/${base}`;
  const head = git(root, 'rev-parse', 'HEAD');
  if (!ancestor(root, head, remote) && !ancestor(root, remote, head))
    throw new Error('Checkout diverged from fetched base: integrate origin manually, resolve conflicts and retry.');
  if (ancestor(root, head, remote)) git(root, 'merge', '--ff-only', remote);
  // Updating an unoccupied base ref is atomic; occupied base checkouts are never mutated.
  const occupied = git(root, 'worktree', 'list', '--porcelain').includes(`branch refs/heads/${base}\n`);
  if (!occupied) {
    try {
      const old = git(root, 'rev-parse', `refs/heads/${base}`);
      if (ancestor(root, old, remote)) git(root, 'update-ref', `refs/heads/${base}`, git(root, 'rev-parse', remote), old);
    } catch { /* missing base or concurrent ref change: preserve it */ }
  }
  return git(root, 'rev-parse', remote);
}
