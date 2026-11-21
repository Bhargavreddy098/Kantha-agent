import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts')) {
      const typed = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(typed))) return nextResolve(typed.href, context);
      const index = new URL(specifier + '/index.ts', context.parentURL);
      if (existsSync(fileURLToPath(index))) return nextResolve(index.href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.ts') && url.startsWith('file:')) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
      const transpiled = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          verbatimModuleSyntax: true,
        },
      });
      return { format: 'module', source: transpiled.outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const {
  createWorktree,
  removeWorktree,
  captureBaselineEdits,
  isWorktreeClean,
  computeCandidateDiff,
  computeCandidateDigest,
  validateRunId,
  execGit,
} = await import('../src/lib/harness/sandbox/worktree.ts');

let assertions = 0;

// Setup disposable test git repository
const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'kantha-worktree-test-'));
const fixtureRepo = path.join(tempBase, 'repo');
const workspacesDir = path.join(tempBase, 'workspaces');

fs.mkdirSync(fixtureRepo);

function git(args, cwd = fixtureRepo) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
}

// 1. Initialize git repo and initial commit
git(['init']);
git(['config', 'user.name', 'Test Agent']);
git(['config', 'user.email', 'test@kantha.local']);
git(['config', 'commit.gpgsign', 'false']);

fs.writeFileSync(path.join(fixtureRepo, 'README.md'), '# Initial Repo\n');
fs.writeFileSync(path.join(fixtureRepo, 'tracked.txt'), 'version 1\n');
git(['add', 'README.md', 'tracked.txt']);
git(['commit', '-m', 'Initial commit']);

const initialCommitSha = git(['rev-parse', 'HEAD']).trim();

// 2. Introduce dirty state: staged, unstaged, untracked with spaces
fs.appendFileSync(path.join(fixtureRepo, 'README.md'), 'Staged modification\n');
git(['add', 'README.md']); // Staged

fs.writeFileSync(path.join(fixtureRepo, 'tracked.txt'), 'version 2 uncommitted\n'); // Unstaged

fs.writeFileSync(path.join(fixtureRepo, 'untracked with spaces.txt'), 'new file with spaces\n'); // Untracked
fs.mkdirSync(path.join(fixtureRepo, 'nested folder'));
fs.writeFileSync(path.join(fixtureRepo, 'nested folder', 'spaced file.txt'), 'nested spaced\n'); // Untracked nested

// --- Test Section 1: validateRunId ---
validateRunId('run-123_abc');
assertions++;

assert.throws(() => validateRunId(''), (err) => err.code === 'invalid_submission');
assertions++;
assert.throws(() => validateRunId('../traversal'), (err) => err.code === 'invalid_submission');
assertions++;
assert.throws(() => validateRunId('has/slash'), (err) => err.code === 'invalid_submission');
assertions++;
assert.throws(() => validateRunId('has\\backslash'), (err) => err.code === 'invalid_submission');
assertions++;
assert.throws(() => validateRunId('has space'), (err) => err.code === 'invalid_submission');
assertions++;
assert.throws(() => validateRunId('a'.repeat(65)), (err) => err.code === 'invalid_submission');
assertions++;

// --- Test Section 2: captureBaselineEdits ---
const baselineEdits = await captureBaselineEdits(fixtureRepo);
assert.ok(baselineEdits.includes('README.md'), 'Should capture staged README.md');
assertions++;
assert.ok(baselineEdits.includes('tracked.txt'), 'Should capture unstaged tracked.txt');
assertions++;
assert.ok(baselineEdits.includes('untracked with spaces.txt'), 'Should capture path with spaces');
assertions++;
assert.ok(
  baselineEdits.some((p) => p.includes('spaced file.txt')),
  'Should capture nested path with spaces'
);
assertions++;

// --- Test Section 3: createWorktree ---
const runId = 'run-test-alpha';
const session = await createWorktree({
  repoRoot: fixtureRepo,
  workspacesDir,
  runId,
  baseRevision: initialCommitSha,
});

assert.equal(session.runId, runId);
assertions++;
assert.equal(session.baseRevision, initialCommitSha);
assertions++;
assert.equal(session.branchName, `kantha/run-${runId}`);
assertions++;
assert.ok(fs.existsSync(session.worktreePath), 'Worktree directory should exist on disk');
assertions++;

// In the worktree, status should be clean and based on initial commit
const cleanInWorktree = await isWorktreeClean(session.worktreePath);
assert.equal(cleanInWorktree, true, 'Worktree should be clean at creation');
assertions++;

// Check that original checkout is completely preserved
const trackedInRepo = fs.readFileSync(path.join(fixtureRepo, 'tracked.txt'), 'utf8').replace(/\r\n/g, '\n');
assert.equal(trackedInRepo, 'version 2 uncommitted\n', 'Original repo modifications must be preserved');
assertions++;
assert.ok(fs.existsSync(path.join(fixtureRepo, 'untracked with spaces.txt')), 'Untracked file must stay in repo');
assertions++;

// Check that worktree has committed content, not user's dirty edits
const trackedInWorktree = fs.readFileSync(path.join(session.worktreePath, 'tracked.txt'), 'utf8').replace(/\r\n/g, '\n');
assert.equal(trackedInWorktree, 'version 1\n', 'Worktree should have clean baseRevision content');
assertions++;
assert.equal(
  fs.existsSync(path.join(session.worktreePath, 'untracked with spaces.txt')),
  false,
  'Untracked file from repo must not be in worktree'
);
assertions++;

// --- Test Section 4: Conflict Guard ---
// Attempting to create with same runId should throw conflict error
await assert.rejects(
  async () => {
    await createWorktree({
      repoRoot: fixtureRepo,
      workspacesDir,
      runId,
    });
  },
  (err) => err.code === 'conflict'
);
assertions++;

// --- Test Section 5: Candidate Diff in Worktree ---
fs.writeFileSync(path.join(session.worktreePath, 'agent-patch.txt'), 'Agent change\n');
const cleanAfterEdit = await isWorktreeClean(session.worktreePath);
assert.equal(cleanAfterEdit, false, 'Worktree should be dirty after agent edits');
assertions++;

const diff = await computeCandidateDiff(session.worktreePath, initialCommitSha);
assert.ok(diff.includes('agent-patch.txt'), 'Diff must contain candidate change');
assertions++;

const digest = await computeCandidateDigest(session.worktreePath, initialCommitSha);
assert.equal(typeof digest, 'string');
assertions++;
assert.equal(digest.length, 64, 'Candidate digest must be 64-character SHA-256');
assertions++;

// --- Test Section 6: removeWorktree & Idempotency ---
await removeWorktree(session);

assert.equal(fs.existsSync(session.worktreePath), false, 'Worktree directory must be removed');
assertions++;

const branchCheck = git(['branch', '--list', session.branchName]).trim();
assert.equal(branchCheck, '', 'Temporary branch must be deleted');
assertions++;

// Original repo remains on master/main with dirty files intact
const repoStillDirty = await captureBaselineEdits(fixtureRepo);
assert.ok(repoStillDirty.includes('README.md'));
assertions++;
assert.ok(repoStillDirty.includes('tracked.txt'));
assertions++;

// Idempotent re-run of removeWorktree should complete without error
await removeWorktree(session);
assertions++;

// Cleanup temporary directory
fs.rmSync(tempBase, { recursive: true, force: true });

console.log(`Passed ${assertions} Ephemeral Git worktree assertions.`);
