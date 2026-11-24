import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  resolveSafeWorkspacePath,
  executeCommandTool,
  readFileTool,
  writeFileTool,
  editFileTool,
  deleteFileTool,
  listFilesTool,
  globFilesTool,
  grepSearchTool,
  gitStatusTool,
  inspectWorkspaceTool,
  getToolCatalog,
  isReadOnlyTool,
} from "../tools";

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

  it("rejects foreign absolute paths outside workspace", () => {
    assert.throws(
      () => resolveSafeWorkspacePath(tmpDir, "/etc/passwd"),
      /Access denied/
    );
  });

  it("rejects symlinks pointing outside workspace root", () => {
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
    }
  });

  it("caps streaming command execution incrementally at 32 KB and blocks destructive commands", async () => {
    const nodeCmd = `node -e "console.log('A'.repeat(100 * 1024))"`;
    const res = await executeCommandTool.execute({ command: nodeCmd }, { workspacePath: tmpDir });
    assert.equal(res.exitCode, 0);
    assert.ok(res.stdout.length <= 34000);
    assert.ok(res.stdout.includes("[Output truncated: reached 32KB cap]"));

    await assert.rejects(
      async () => await executeCommandTool.execute({ command: "rm -rf /" }, { workspacePath: tmpDir }),
      /safety policy/
    );
  });

  it("recovers gracefully from non-zero exit codes without throwing", async () => {
    const res = await executeCommandTool.execute({ command: `node -e "process.exit(42)"` }, { workspacePath: tmpDir });
    assert.equal(res.exitCode, 42);
  });

  it("performs bounded file reads up to 64KB, supports line slicing, and rejects binary files", async () => {
    const filePath = path.join(tmpDir, "large.txt");
    fs.writeFileSync(filePath, "B".repeat(100 * 1024), "utf-8");

    const res = await readFileTool.execute({ filePath: "large.txt" }, { workspacePath: tmpDir });
    assert.ok(res.content.length <= 67000);
    assert.ok(res.content.includes("[Output truncated: exceeded 64KB cap]"));

    fs.writeFileSync(path.join(tmpDir, "lines.txt"), "one\ntwo\nthree\nfour", "utf-8");
    const sliced = await readFileTool.execute(
      { filePath: "lines.txt", startLine: 2, endLine: 3 },
      { workspacePath: tmpDir }
    );
    assert.equal(sliced.content, "2: two\n3: three");

    const binPath = path.join(tmpDir, "binary.bin");
    fs.writeFileSync(binPath, Buffer.from([0x00, 0x01, 0x02, 0x03]));
    await assert.rejects(
      async () => await readFileTool.execute({ filePath: "binary.bin" }, { workspacePath: tmpDir }),
      /Cannot read binary file/
    );
  });

  it("supports write_file, edit_file, delete_file, list_files, glob_files, grep_search, git_status, and inspect_workspace", async () => {
    await writeFileTool.execute(
      { filePath: "src/app.ts", content: "export const greeting = 'hello';\nexport const version = 1;\n" },
      { workspacePath: tmpDir }
    );
    await writeFileTool.execute(
      { filePath: "package.json", content: JSON.stringify({ name: "demo-pkg", scripts: { test: "node --test" } }) },
      { workspacePath: tmpDir }
    );

    const edited = await editFileTool.execute(
      { filePath: "src/app.ts", oldString: "'hello'", newString: "'kantha'" },
      { workspacePath: tmpDir }
    );
    assert.equal(edited.replacements, 1);

    const listed = await listFilesTool.execute({ directoryPath: ".", recursive: true }, { workspacePath: tmpDir });
    assert.ok(listed.files.includes("src/app.ts"));

    const globbed = await globFilesTool.execute({ pattern: "src/**/*.ts" }, { workspacePath: tmpDir });
    assert.deepEqual(globbed.matches, ["src/app.ts"]);

    const grepped = await grepSearchTool.execute({ pattern: "kantha" }, { workspacePath: tmpDir });
    assert.equal(grepped.matches.length, 1);
    assert.equal(grepped.matches[0].file, "src/app.ts");
    assert.equal(grepped.matches[0].line, 1);

    const inspected = await inspectWorkspaceTool.execute({} as never, { workspacePath: tmpDir });
    assert.equal(inspected.packageInfo?.name, "demo-pkg");

    const git = await gitStatusTool.execute({}, { workspacePath: tmpDir });
    assert.equal(git.isGitRepo, false);

    const del = await deleteFileTool.execute({ filePath: "src/app.ts" }, { workspacePath: tmpDir });
    assert.equal(del.deleted, true);

    assert.equal(getToolCatalog().length, 10);
    assert.equal(isReadOnlyTool("grep_search"), true);
    assert.equal(isReadOnlyTool("edit_file"), false);
  });
});
