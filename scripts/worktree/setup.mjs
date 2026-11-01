import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { layout } from './config.mjs';
import { git } from './git.mjs';
const { root } = layout();
const lock = git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir') + '/repo-gates-setup.lock';
const result = spawnSync('flock', ['-w', '3600', lock, process.execPath, fileURLToPath(new URL('./setup-locked.mjs', import.meta.url)), ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
