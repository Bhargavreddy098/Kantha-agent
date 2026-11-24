# Kantha Harness Tool Suite

**Implementation:** `apps/daemon/src/harness/tools.ts`  
**Discovery API:** `GET /api/harness/tools`

---

## 1. Security & Containment Model

Every tool in the Kantha Harness operates strictly inside the daemon's bound workspace boundary:

1. **Canonical Path Containment (`resolveSafeWorkspacePath`):**
   - Resolves the real canonical path of the workspace root (`fs.realpathSync`).
   - Walks ancestor directories using `lstatSync` to resolve symlinks (including dangling symlinks on not-yet-created files).
   - Rejects any path whose normalized relative path escapes via `..` or absolute roots.
2. **Binary & Size Caps:**
   - `read_file` caps reads at `64 KB` and rejects binary files containing null bytes.
   - `grep_search` skips files over `512 KB`, binary buffers, and ignored build/VCS directories (`node_modules`, `.git`, `dist`, `.kantha-data`).
   - `execute_command` caps stdout and stderr at `32 KB` each and enforces bounded execution timeouts (default `30s`, max `120s`) with process-tree cleanup.
3. **No Shell Interpolation in Git Inspection:**
   - `git_status` executes `git` via `child_process.execFileSync("git", [...args])` with static argument arrays — never via a shell.
4. **Destructive Command Policy:**
   - `execute_command` blocks catastrophic shell patterns (`rm -rf /`, `mkfs`, `dd if=`, fork bombs, `shutdown`/`reboot`) before spawning.
5. **Risk-Based Approval Policy:**
   - Tools with `requiresApproval: false` (`read` risk) auto-execute and may be batched concurrently.
   - Tools with `requiresApproval: true` (`write` / `exec` risk) execute sequentially and require explicit approval via `ApprovalManager` unless the session has `autoApprove: true`.

---

## 2. Registered Tools Reference (10 Tools)

| Tool | Category | Risk | Approval | Summary |
| :--- | :--- | :--- | :--- | :--- |
| `inspect_workspace` | `filesystem` | `read` | Auto | Compact snapshot of workspace root entries, `package.json` metadata/scripts, git branch, and Node runtime version. |
| `read_file` | `filesystem` | `read` | Auto | Reads UTF-8 workspace files (64KB cap) with optional 1-indexed `startLine` / `endLine` slicing. |
| `list_files` | `filesystem` | `read` | Auto | Lists directory entries with type/size metadata; supports `recursive` + `maxDepth` (up to 5). |
| `write_file` | `filesystem` | `write` | Gated | Creates or overwrites a UTF-8 file inside the workspace (auto-creates parent dirs); returns bytes & lines written. |
| `edit_file` | `filesystem` | `write` | Gated | Surgical exact search-and-replace (`oldString` → `newString`) with uniqueness check (or `replaceAll: true`). |
| `delete_file` | `filesystem` | `write` | Gated | Removes a single regular file inside the workspace; refuses workspace root and directories. |
| `glob_files` | `search` | `read` | Auto | Matches workspace files using glob syntax (`*`, `**`, `?`), capped at 200 matches. |
| `grep_search` | `search` | `read` | Auto | Searches literal or regex patterns across text files with optional path scope and match caps (up to 100). |
| `git_status` | `git` | `read` | Auto | Read-only repository inspection (`branch`, porcelain `statusLines`, `diffStat`, and `recentCommits`). |
| `execute_command` | `runtime` | `exec` | Gated | Executes shell commands in workspace `cwd` with timeout, process-tree termination, output caps, and safety blocklist. |

---

## 3. Programmatic Exports

- `toolRegistry`: `Map<string, ToolDefinition>` for runtime dispatch.
- `isReadOnlyTool(name)`: Single source of truth for `ApprovalManager` and `partitionToolCalls`.
- `getToolCatalog()`: Metadata + JSON Schema payload served by `GET /api/harness/tools` and rendered in the Web Workbench Inspector.
- `getKanthaToolSchemas()`: `KanthaTool[]` array passed directly into `GatewayService.stream({ tools })`.
