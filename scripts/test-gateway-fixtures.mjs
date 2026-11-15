import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

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
});

const { runFixtureVerification } = await import('../src/lib/gateway/fixtures/verify-fixtures.ts');
const result = runFixtureVerification();
if (!result.passed) throw new Error(result.errors.join('\n'));
console.log('Passed ' + result.testCount + ' gateway fixture assertions.');
