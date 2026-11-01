import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git } from './git.mjs';
import { refresh } from './freshness.mjs';
import { run } from './lifecycle.mjs';
test('freshness, local commits, dirty files, divergence, failed fetch and sibling safety', () => {
 const dir=mkdtempSync(join(tmpdir(),'repo-gates-test-'));
 try {
 const remote=join(dir,'remote.git'),a=join(dir,'a'),b=join(dir,'b');
 git(dir,'init','--bare',remote);git(dir,'clone',remote,a);
 for(const [k,v] of [['user.name','Test'],['user.email','test@invalid']]) git(a,'config',k,v);
 git(a,'checkout','-b','main');writeFileSync(join(a,'file'),'one');git(a,'add','.');git(a,'commit','-m','initial');git(a,'push','origin','main');git(remote,'symbolic-ref','HEAD','refs/heads/main');git(dir,'clone',remote,b);
 git(a,'symbolic-ref','refs/remotes/origin/HEAD','refs/remotes/origin/main');git(a,'checkout','-b','topic');git(b,'config','user.name','Test');git(b,'config','user.email','test@invalid');
 writeFileSync(join(b,'file'),'two');git(b,'commit','-am','advance');git(b,'push');refresh({root:a,base:'main'});assert.equal(git(a,'rev-parse','HEAD'),git(b,'rev-parse','HEAD'));assert.equal(git(a,'rev-parse','main'),git(b,'rev-parse','HEAD'));assert.equal(git(a,'branch','--show-current'),'topic');
 writeFileSync(join(a,'local'),'local');git(a,'add','.');git(a,'commit','-m','local');const head=git(a,'rev-parse','HEAD');refresh({root:a,base:'main'});assert.equal(git(a,'rev-parse','HEAD'),head);
 writeFileSync(join(a,'dirty'),'dirty');assert.throws(()=>refresh({root:a,base:'main'}),/Dirty/);rmSync(join(a,'dirty'));
 writeFileSync(join(b,'file'),'three');git(b,'commit','-am','advance again');git(b,'push');assert.throws(()=>refresh({root:a,base:'main'}),/diverged/);
 git(a,'remote','set-url','origin',join(dir,'missing'));assert.throws(()=>refresh({root:a,base:'main'}),/Fetching/);
 writeFileSync(join(b,'keep'),'sibling');for(const c of ['start','stop','teardown','cleanup','cleanup'])run(c,a);assert.ok(existsSync(join(b,'keep')));
 } finally {rmSync(dir,{recursive:true,force:true});}
});
