import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveSafeWorkspacePath, executeCommandTool, readFileTool, writeFileTool } from "../tools";

describe("Harness Tools & Path Containment", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `kantha-tools-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  it("permits valid relative path within workspace and returns realTarget", () => {
    const resolved = resolveSafeWorkspacePath(tmpDir, "src/index.ts");
    assert.equal(resolved, path.resolve(fs.realpathSync(tmpDir), "src/index.ts"));
  });

  it("permits creating new files in non-existent nested directories without ENOENT", () => {
    const resolved = resolveSafeWorkspacePath(tmpDir, "new_folder/sub_folder/file.txt");
    assert.ok(resolved.endsWith(path.join("new_folder", "sub_folder", "file.txt")));
  });

  it("rejects path traversal outside workspace root (..)", () => {
    assert.throws(
      () => resolveSafeWorkspacePath(tmpDir, "../../etc/passwd"),
      /Access denied/
    );
  });

  it("rejects foreign absolute Windows drive paths", () => {
    assert.throws(
      () => resolveSafeWorkspacePath(tmpDir, "C:\\Windows\\System32\\cmd.exe"),
      /Access denied/
    );
  });

  it("rejects symlinks pointing outside workspace root", () => {
    // Create an outside target directory
    const outsideDir = path.join(os.tmpdir(), `outside-dir-${Date.now()}`);
    fs.mkdirSync(outsideDir, { recursive: true });
    const symlinkPath = path.join(tmpDir, "evil_link");
    try {
      fs.symlinkSync(outsideDir, symlinkPath, "junction");
      assert.throws(
        () => resolveSafeWorkspacePath(tmpDir, "evil_link/secret.txt"),
        /Access denied/
      );
    } catch (e: any) {
      if (e.message.includes("Access denied")) throw e;
      // Skip if OS permissions restrict symlink creation
    }
  });

  it("caps streaming command execution incrementally at 32 KB", async () => {
    // Generate command that outputs 100 KB
    const nodeCmd = `node -e "console.log('A'.repeat(100 * 1024))"`;
    const res = await executeCommandTool.execute({ command: nodeCmd }, { workspacePath: tmpDir });
    assert.equal(res.exitCode, 0);
    assert.ok(res.stdout.length <= 34000);
    assert.ok(res.stdout.includes("[Output truncated: reached 32KB cap]"));
  });

  it("recovers gracefully from non-zero exit codes without throwing", async () => {
    const res = await executeCommandTool.execute({ command: `node -e "process.exit(42)"` }, { workspacePath: tmpDir });
    assert.equal(res.exitCode, 42);
  });

  it("performs bounded file reads up to 64KB and truncates", async () => {
    const filePath = path.join(tmpDir, "large.txt");
    fs.writeFileSync(filePath, "B".repeat(100 * 1024), "utf-8");

    const res = await readFileTool.execute({ filePath: "large.txt" }, { workspacePath: tmpDir });
    assert.ok(res.content.length <= 67000);
    assert.ok(res.content.includes("[Output truncated: exceeded 64KB cap]"));
  });

  it("rejects reading binary files with null bytes", async () => {
    const filePath = path.join(tmpDir, "binary.bin");
    fs.writeFileSync(filePath, Buffer.from([0x00, 0x01, 0x02, 0x03]));

    await assert.rejects(
      async () => await readFileTool.execute({ filePath: "binary.bin" }, { workspacePath: tmpDir }),
      /Cannot read binary file/
    );
  });
});
