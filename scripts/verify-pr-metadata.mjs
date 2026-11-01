import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { validatePullRequest } from './pr-standard.mjs';
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
if (event.pull_request) {
 const pr = event.pull_request;
 assert.deepEqual(validatePullRequest(pr), [], 'Actual PR metadata must meet the standard');
 assert.ok(validatePullRequest({ ...pr, title: 'invalid title' }).length > 0);
 for (const newline of ['\n', '\r\n', '\r']) {
  assert.deepEqual(validatePullRequest({ ...pr, body: pr.body.replace(/\r\n?/g, '\n').replaceAll('\n', newline) }), []);
 }
 console.log(`Validated actual PR #${pr.number}, invalid title rejection and LF/CRLF/CR bodies`);
}
