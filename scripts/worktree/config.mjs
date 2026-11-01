import { realpathSync } from 'node:fs';
import { git } from './git.mjs';
export function layout(cwd = process.cwd()) {
  const root = realpathSync(git(cwd, 'rev-parse', '--show-toplevel'));
  const base = git(root, 'symbolic-ref', 'refs/remotes/origin/HEAD').replace('refs/remotes/origin/', '');
  return { root, base };
}
