import { layout } from './config.mjs';
import { refresh } from './freshness.mjs';
import { git } from './git.mjs';
const config = layout();
const sha = refresh(config);
const [path, branch] = process.argv.slice(2);
if (path) {
 if (!branch) throw new Error('Usage: setup.mjs [new-path new-branch]');
 git(config.root, 'worktree', 'add', '-b', branch, path, sha);
}
console.log(`Fetched base ${sha}; setup complete`);
