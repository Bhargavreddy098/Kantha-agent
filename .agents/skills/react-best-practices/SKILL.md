---
name: react-best-practices
description: "Vercel's impact-ranked React and Next.js performance rules and code quality standards: eliminating waterfalls, bundle size optimization, re-render avoidance, and idiomatic state management."
---

# React & Next.js Best Practices (Impact-Ranked)

Guidelines for performant, maintainable React and Next.js applications based on Vercel's best practices.

## 1. Eliminate Waterfalls (Critical)
- Parallelize independent async calls using `Promise.all` or `Promise.allSettled`.
- Defer awaiting non-critical data or stream it using `<Suspense>` boundaries.
- Avoid chaining async requests where the subsequent request does not depend on the previous result.

## 2. Component Composition & State Architecture
- Avoid prop drilling: compose components or use targeted context/hooks where appropriate.
- Derive state during render instead of syncing state with `useEffect`.
- Keep state local to where it is consumed; lift state up only as far as necessary.

## 3. Asynchronous Code Cleanliness
- Use modern `async/await` syntax with try/catch/finally blocks.
- Cancel pending requests or timeouts when components unmount using `AbortController` in `useEffect`.
- Handle edge cases: network disconnects, invalid payloads, and streaming cancellations.
