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

const { runInferenceVerification } = await import('../src/lib/harness/verify-inference.ts');
const result = await runInferenceVerification();
if (!result.passed) throw new Error(result.errors.join('\n'));
console.log(`Passed ${result.testCount} H2 inference assertions.`);
