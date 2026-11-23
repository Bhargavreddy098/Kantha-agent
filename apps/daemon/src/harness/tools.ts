import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";

export interface ToolExecutionContext {
  workspacePath: string;
}

export interface ToolDefinition<TArgs = any, TOutput = any> {
  name: string;
  description: string;
  execute: (args: TArgs, ctx: ToolExecutionContext) => Promise<TOutput>;
}

/**
 * Validates that the requested target path resolves strictly inside the workspace boundary.
 * Handles ancestor directory resolution for new files, detects dangling symlinks, and normalizes Windows paths.
 * Returns the canonical, verified realTarget path.
 */
export function resolveSafeWorkspacePath(workspacePath: string, relativePath: string): string {
  const realWorkspace = fsSync.realpathSync(path.resolve(workspacePath));
  const resolved = path.resolve(realWorkspace, relativePath);

  // Walk up to find nearest existing ancestor using lstatSync to detect dangling symlinks
  let cur = resolved;
  const missingSegments: string[] = [];

  while (true) {
    try {
      const stat = fsSync.lstatSync(cur);
      if (stat.isSymbolicLink()) {
        const linkTarget = fsSync.realpathSync(cur);
        cur = linkTarget;
      }
      break;
    } catch (err: any) {
      if (err.code === "ENOENT") {
        const parent = path.dirname(cur);
        if (parent === cur) break;
        missingSegments.unshift(path.basename(cur));
        cur = parent;
      } else {
        throw err;
      }
    }
  }

  const realAncestor = fsSync.realpathSync(cur);
  const realTarget = missingSegments.length > 0 ? path.join(realAncestor, ...missingSegments) : realAncestor;

  // Normalized relative check
  const normWorkspace = process.platform === "win32" ? realWorkspace.toLowerCase() : realWorkspace;
  const normTarget = process.platform === "win32" ? realTarget.toLowerCase() : realTarget;

  const rel = path.relative(normWorkspace, normTarget);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Access denied: path '${relativePath}' escapes workspace root.`);
  }

  return realTarget;
}

export const readFileTool: ToolDefinition<{ filePath: string }, { content: string }> = {
  name: "read_file",
  description: "Read the contents of a file within the workspace (up to 64KB).",
  execute: async ({ filePath }, ctx) => {
    const fullPath = resolveSafeWorkspacePath(ctx.workspacePath, filePath);
    const MAX_BYTES = 64 * 1024; // 64 KB
    const buffer = Buffer.alloc(MAX_BYTES + 1);

    const fd = await fs.open(fullPath, "r");
    let bytesRead = 0;
    try {
      const readResult = await fd.read(buffer, 0, MAX_BYTES + 1, 0);
      bytesRead = readResult.bytesRead;
    } finally {
      await fd.close();
    }

    const slice = buffer.subarray(0, Math.min(bytesRead, MAX_BYTES));
    if (slice.includes(0)) {
      throw new Error(`Cannot read binary file '${filePath}'.`);
    }

    let text = slice.toString("utf-8");
    if (bytesRead > MAX_BYTES) {
      text += "\n[Output truncated: exceeded 64KB cap]";
    }
    return { content: text };
  },
};

export const writeFileTool: ToolDefinition<{ filePath: string; content: string }, { bytesWritten: number }> = {
  name: "write_file",
  description: "Create or overwrite a file with given contents.",
  execute: async ({ filePath, content }, ctx) => {
    const fullPath = resolveSafeWorkspacePath(ctx.workspacePath, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
    return { bytesWritten: Buffer.byteLength(content, "utf-8") };
  },
};

export const listFilesTool: ToolDefinition<{ directoryPath?: string }, { files: string[] }> = {
  name: "list_files",
  description: "List files and directories within a given directory path.",
  execute: async ({ directoryPath = "." }, ctx) => {
    const fullPath = resolveSafeWorkspacePath(ctx.workspacePath, directoryPath);
    const entries = await fs.readdir(fullPath);
    return { files: entries };
  },
};

export const executeCommandTool: ToolDefinition<
  { command: string; timeoutMs?: number },
  { stdout: string; stderr: string; exitCode: number }
> = {
  name: "execute_command",
  description: "Execute a command inside the workspace directory.",
  execute: async ({ command, timeoutMs = 30000 }, ctx) => {
    const realWorkspace = fsSync.realpathSync(path.resolve(ctx.workspacePath));
    const MAX_BYTES = 32 * 1024; // 32 KB

    return new Promise((resolve) => {
      const child = spawn(command, {
        shell: true,
        cwd: realWorkspace,
      });

      let stdout = "";
      let stderr = "";
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let stdoutTruncated = false;
      let stderrTruncated = false;
      let finished = false;

      const killTree = () => {
        if (!child.pid) return;
        if (process.platform === "win32") {
          try {
            execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: "ignore" });
          } catch {}
        } else {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {
            child.kill("SIGKILL");
          }
        }
      };

      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          killTree();
          resolve({
            stdout,
            stderr: stderr + `\n[Command timed out after ${timeoutMs}ms]`,
            exitCode: 124,
          });
        }
      }, timeoutMs);

      child.stdout?.on("data", (chunk: Buffer) => {
        if (stdoutBytes < MAX_BYTES) {
          const remaining = MAX_BYTES - stdoutBytes;
          const toAdd = chunk.subarray(0, remaining);
          stdout += toAdd.toString("utf-8");
          stdoutBytes += toAdd.length;
          if (chunk.length > remaining && !stdoutTruncated) {
            stdoutTruncated = true;
            stdout += "\n[Output truncated: reached 32KB cap]";
          }
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        if (stderrBytes < MAX_BYTES) {
          const remaining = MAX_BYTES - stderrBytes;
          const toAdd = chunk.subarray(0, remaining);
          stderr += toAdd.toString("utf-8");
          stderrBytes += toAdd.length;
          if (chunk.length > remaining && !stderrTruncated) {
            stderrTruncated = true;
            stderr += "\n[Output truncated: reached 32KB cap]";
          }
        }
      });

      child.on("close", (code) => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          resolve({
            stdout,
            stderr,
            exitCode: code ?? 0,
          });
        }
      });

      child.on("error", (err) => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          resolve({
            stdout,
            stderr: err.message,
            exitCode: 1,
          });
        }
      });
    });
  },
};

export const toolRegistry = new Map<string, ToolDefinition>([
  [readFileTool.name, readFileTool],
  [writeFileTool.name, writeFileTool],
  [listFilesTool.name, listFilesTool],
  [executeCommandTool.name, executeCommandTool],
]);
