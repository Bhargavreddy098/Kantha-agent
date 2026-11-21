import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

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
 */
function resolveSafePath(workspacePath: string, relativePath: string): string {
  const root = path.resolve(workspacePath);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Access denied: path '${relativePath}' traverses outside the workspace.`);
  }
  return resolved;
}

export const readFileTool: ToolDefinition<{ filePath: string }, { content: string }> = {
  name: "read_file",
  description: "Read the full contents of a file within the workspace.",
  execute: async ({ filePath }, ctx) => {
    const fullPath = resolveSafePath(ctx.workspacePath, filePath);
    const content = await fs.readFile(fullPath, "utf-8");
    return { content };
  },
};

export const writeFileTool: ToolDefinition<{ filePath: string; content: string }, { bytesWritten: number }> = {
  name: "write_file",
  description: "Create or overwrite a file with given contents.",
  execute: async ({ filePath, content }, ctx) => {
    const fullPath = resolveSafePath(ctx.workspacePath, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
    return { bytesWritten: Buffer.byteLength(content, "utf-8") };
  },
};

export const listFilesTool: ToolDefinition<{ directoryPath?: string }, { files: string[] }> = {
  name: "list_files",
  description: "List files and directories within a given directory path.",
  execute: async ({ directoryPath = "." }, ctx) => {
    const fullPath = resolveSafePath(ctx.workspacePath, directoryPath);
    const entries = await fs.readdir(fullPath);
    return { files: entries };
  },
};

export const executeCommandTool: ToolDefinition<{ command: string }, { stdout: string; stderr: string; exitCode: number }> = {
  name: "execute_command",
  description: "Execute a command inside the workspace directory.",
  execute: async ({ command }, ctx) => {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: ctx.workspacePath,
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { stdout, stderr, exitCode: 0 };
    } catch (err: any) {
      return {
        stdout: err.stdout || "",
        stderr: err.stderr || err.message,
        exitCode: err.code || 1,
      };
    }
  },
};

export const toolRegistry = new Map<string, ToolDefinition>([
  [readFileTool.name, readFileTool],
  [writeFileTool.name, writeFileTool],
  [listFilesTool.name, listFilesTool],
  [executeCommandTool.name, executeCommandTool],
]);
