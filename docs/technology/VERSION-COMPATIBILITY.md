# Version Compatibility & Runtime Specification

**Status:** APPROVED FOR PLANNING  
**Version:** 2.0.0  
**Effective Date:** 2026-11-21  
**Document Level:** Level 2 — Technology Specification

---

## 1. Runtime Standardization: Bun v1.4+

Kantha universally standardizes on **Bun v1.4+** as its canonical runtime and package manager across all environments:

| Dimension | Specification | Notes |
|---|---|---|
| **Runtime Engine** | Bun `v1.4.0+` | Built on WebKit JavaScriptCore; provides native SQLite (`bun:sqlite`), native WebSockets, and high-performance file I/O. |
| **Package Manager** | Bun Workspaces | Sub-second package installations, native workspace protocol (`workspace:*`). |
| **Monorepo Engine** | Turborepo `v2.4+` | Coordinates task dependencies (`build`, `dev`, `lint`, `typecheck`) with local caching. |
| **Frontend Tooling** | Vite `v6.2+` | Pure ESM bundling, instant Hot Module Replacement (HMR). |

---

## 2. Cross-Platform OS Compatibility

| Environment | Supported Operating Systems | PTY Driver | File Watching |
|---|---|---|---|
| **Windows** | Windows 10 / 11 | `bun-pty` fallback | `ripgrep` + Node/Bun fs watchers |
| **macOS** | macOS 13+ (Ventura, Sonoma, Sequoia) | `Bun.Terminal` | Native OS file events + `ripgrep` |
| **Linux** | Ubuntu 22.04+, Debian 12+, Fedora | `Bun.Terminal` | inotify + `ripgrep` |

---

## 3. Verification Commands for Environment Health

```bash
# Verify Bun version (>= 1.4.0)
bun -e "const [major, minor] = process.versions.bun.split('.').map(Number); if (major < 1 || (major === 1 && minor < 4)) throw new Error('Bun 1.4+ required'); console.log('Bun version OK: ' + process.versions.bun);"

# Verify Turborepo execution
bunx turbo --version

# Run monorepo typecheck across all workspaces
bun run typecheck

# Run tests
bun test
```
