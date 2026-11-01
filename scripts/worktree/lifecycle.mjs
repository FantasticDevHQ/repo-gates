import { rmSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { layout } from './config.mjs';
import { refresh } from './freshness.mjs';
export function run(command, cwd) {
  const config = layout(cwd);
  if (command === 'setup') return refresh(config);
  if (command === 'cleanup') {
    for (const name of ['dist', 'coverage']) {
      const path = join(config.root, name);
      try { if (lstatSync(path).isSymbolicLink()) throw new Error(`Refusing symlink cleanup: ${path}`); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      rmSync(path, { recursive: true, force: true });
    }
  } else if (!['start', 'stop', 'teardown'].includes(command)) throw new Error('Unknown lifecycle command');
  return `${command}: backend-free library; no persistent processes or ports. Generated data preserved unless cleanup was requested.`;
}
