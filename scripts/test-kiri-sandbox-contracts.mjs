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

const {
  validateScopedPath,
  isBlacklistedPath,
  SandboxPathError,
} = await import('../src/lib/harness/sandbox/path-guard.ts');
const { BoundedOutputBuffer } = await import('../src/lib/harness/sandbox/stream-limiter.ts');

let assertions = 0;

// Test 1: isBlacklistedPath checks
assert.equal(isBlacklistedPath('.env'), true);
assertions++;
assert.equal(isBlacklistedPath('.env.local'), true);
assertions++;
assert.equal(isBlacklistedPath('.env.production'), true);
assertions++;
assert.equal(isBlacklistedPath('config/.env.test'), true);
assertions++;
assert.equal(isBlacklistedPath('.git/HEAD'), true);
assertions++;
assert.equal(isBlacklistedPath('.git/config'), true);
assertions++;
assert.equal(isBlacklistedPath('.ssh/id_rsa'), true);
assertions++;
assert.equal(isBlacklistedPath('.aws/credentials'), true);
assertions++;
assert.equal(isBlacklistedPath('node_modules/package/index.js'), true);
assertions++;
assert.equal(isBlacklistedPath('src/components/Button.tsx'), false);
assertions++;
assert.equal(isBlacklistedPath('package.json'), false);
assertions++;
assert.equal(isBlacklistedPath('README.md'), false);
assertions++;

// Test 2: validateScopedPath boundary containment
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kantha-sandbox-test-'));
const subDir = path.join(tempDir, 'src');
fs.mkdirSync(subDir);
const testFile = path.join(subDir, 'index.ts');
fs.writeFileSync(testFile, 'console.log("hello");');

const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kantha-outside-'));
const secretFile = path.join(outsideDir, 'secret.txt');
fs.writeFileSync(secretFile, 'super_secret');

try {
  // 1. Valid existing file
  const validPath = validateScopedPath(tempDir, 'src/index.ts');
  assert.equal(fs.realpathSync(validPath), fs.realpathSync(testFile));
  assertions++;

  // 2. Valid uncreated file in existing subdirectory
  const uncreatedPath = validateScopedPath(tempDir, 'src/new-file.ts');
  assert.equal(path.basename(uncreatedPath), 'new-file.ts');
  assertions++;

  // 3. Valid workspace root itself
  const rootPath = validateScopedPath(tempDir, '.');
  assert.equal(fs.realpathSync(rootPath), fs.realpathSync(tempDir));
  assertions++;

  // 4. Reject parent traversal attack
  assert.throws(
    () => validateScopedPath(tempDir, '../outside.txt'),
    (err) => err instanceof SandboxPathError && err.code === 'denied'
  );
  assertions++;

  // 5. Reject deep traversal
  assert.throws(
    () => validateScopedPath(tempDir, 'src/../../outside.txt'),
    (err) => err instanceof SandboxPathError && err.code === 'denied'
  );
  assertions++;

  // 6. Reject null bytes
  assert.throws(
    () => validateScopedPath(tempDir, 'src/file\0.ts'),
    (err) => err instanceof SandboxPathError
  );
  assertions++;

  // 7. Reject blacklisted files (.env)
  assert.throws(
    () => validateScopedPath(tempDir, '.env'),
    (err) => err instanceof SandboxPathError
  );
  assertions++;

  assert.throws(
    () => validateScopedPath(tempDir, 'src/.env.local'),
    (err) => err instanceof SandboxPathError
  );
  assertions++;

  // 8. Reject blacklisted directory (.git)
  assert.throws(
    () => validateScopedPath(tempDir, '.git/config'),
    (err) => err instanceof SandboxPathError
  );
  assertions++;

  // 9. Symlink traversal attack
  try {
    const symlinkPath = path.join(tempDir, 'symlink-to-outside');
    fs.symlinkSync(outsideDir, symlinkPath, 'dir');

    assert.throws(
      () => validateScopedPath(tempDir, 'symlink-to-outside/secret.txt'),
      (err) => err instanceof SandboxPathError
    );
    assertions++;
  } catch (symlinkErr) {
    if (symlinkErr.code !== 'EPERM') throw symlinkErr;
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.rmSync(outsideDir, { recursive: true, force: true });
}

// Test 3: BoundedOutputBuffer small output
const buffer = new BoundedOutputBuffer(8192);
buffer.appendStdout('Hello World\n');
buffer.appendStdout('Second line of stdout\n');
buffer.appendStderr('A small warning\n');

const snapshot = buffer.getSnapshot();
assert.equal(snapshot.stdout, 'Hello World\nSecond line of stdout\n');
assertions++;
assert.equal(snapshot.stderr, 'A small warning\n');
assertions++;
assert.equal(snapshot.truncated, false);
assertions++;
assert.equal(snapshot.totalBytes, 34 + 16);
assertions++;

// Test 4: BoundedOutputBuffer oversized truncation
const maxBytes = 1000;
const truncatedBuffer = new BoundedOutputBuffer(maxBytes);

const headMarker = '--- HEAD OF STREAM START ---';
const tailMarker = '--- TAIL OF STREAM END ---';

truncatedBuffer.appendStdout(headMarker + '\n');
for (let i = 0; i < 200; i++) {
  truncatedBuffer.appendStdout(`Line ${i}: Some repetitive log data that fills the buffer quickly.\n`);
}
truncatedBuffer.appendStdout(tailMarker);

const truncatedSnapshot = truncatedBuffer.getSnapshot();
assert.equal(truncatedSnapshot.truncated, true);
assertions++;
assert.ok(truncatedSnapshot.totalBytes > 10000);
assertions++;
assert.ok(truncatedSnapshot.stdout.startsWith(headMarker));
assertions++;
assert.ok(truncatedSnapshot.stdout.endsWith(tailMarker));
assertions++;
assert.ok(truncatedSnapshot.stdout.includes('bytes truncated'));
assertions++;

console.log(`Passed ${assertions} Sandbox contracts, path guard, and stream limiter assertions.`);
