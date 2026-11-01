import { execFileSync } from 'node:child_process';
export function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 30000 }).trim();
}
export function ancestor(root, a, b) {
  try { git(root, 'merge-base', '--is-ancestor', a, b); return true; } catch { return false; }
}
