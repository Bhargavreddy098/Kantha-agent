---
name: modern-javascript-patterns
description: "Master ES6+ features including async/await, destructuring, spread operators, arrow functions, promises, modules, iterators, generators, and functional programming patterns for writing clean, efficient, maintainable JavaScript/TypeScript code. Use when refactoring legacy code, structuring async workflows, or optimizing code readability for humans and agents."
---

# Modern JavaScript & TypeScript Patterns

Comprehensive guide for writing idiomatic, maintainable, performant modern JavaScript and TypeScript (ES6+) code.

## Core Principles

### 1. Modern Asynchronous Flow Control (`async/await`)
- **Clean `async/await` syntax**: Always prefer `async/await` over promise chaining (`.then().catch()`) or nested callbacks for synchronous-looking asynchronous control flow.
- **Eliminate Waterfalls**: Avoid sequential `await` when calls are independent. Use `Promise.all()` or `Promise.allSettled()` to execute independent async tasks concurrently.
  ```typescript
  // INCORRECT (Waterfall)
  const user = await fetchUser(id);
  const settings = await fetchSettings(id);
  const notifications = await fetchNotifications(id);

  // CORRECT (Concurrent execution)
  const [user, settings, notifications] = await Promise.all([
    fetchUser(id),
    fetchSettings(id),
    fetchNotifications(id),
  ]);
  ```
- **Robust Error Handling**: Wrap async operations with granular `try/catch` blocks. Attach contextual error messages and preserve the original error using `cause`.
  ```typescript
  try {
    const data = await fetchGatewayData();
    return data;
  } catch (error) {
    throw new Error('Failed to fetch gateway data', { cause: error });
  }
  ```
- **Proper Stream & Resource Cleanup**: Always close streams, file descriptors, or abort controllers using `finally` blocks or `try...finally`.

### 2. Modern Syntax & Scope
- **Block Scoping**: Always use `const` by default; use `let` only for reassigned variables. Never use `var`.
- **Destructuring with Defaults**: Use destructuring with sensible defaults for function arguments and object/array unpacking.
  ```typescript
  function configureSession({ timeoutMs = 5000, retryCount = 3, ...options }: SessionConfig = {}) {
    // ...
  }
  ```
- **Optional Chaining (`?.`) & Nullish Coalescing (`??`)**: Safely navigate nested structures and assign fallbacks without masking falsey booleans or zero values.
  ```typescript
  const maxTokens = config?.limits?.maxTokens ?? 2048;
  ```

### 3. Functional Data Transformation Pipelines
- Favor declarative array transformations (`map`, `filter`, `reduce`, `some`, `every`) over imperative mutation loops (`for`, `while`).
- Keep transformation functions pure, side-effect-free, and easy to test.

### 4. Code Readability for Humans and Agents
- **Descriptive Naming**: Use clear, self-documenting function and variable names (e.g., `isSessionExpired`, `parseEventStreamChunk`).
- **Early Returns (Guard Clauses)**: Avoid deep nested `if/else` structures. Return early on invalid preconditions.
  ```typescript
  // INCORRECT
  if (session) {
    if (session.isActive) {
      // 50 lines of logic
    }
  }

  // CORRECT
  if (!session || !session.isActive) {
    return null;
  }
  // clean linear flow
  ```
- **Explicit Typing**: Define explicit TypeScript interfaces and return types at module and API boundaries.
