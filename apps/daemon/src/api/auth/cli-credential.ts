import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import child_process from "node:child_process";

export function getDaemonTokenPath(port: number, dataDir?: string): string {
  const baseDir =
    dataDir ||
    process.env.KANTHA_DATA_DIR ||
    path.resolve(process.cwd(), ".kantha-data");
  return path.join(baseDir, `daemon_${port}.token`);
}

export class CliCredentialManager {
  public readonly cliToken: string;
  public readonly tokenPath: string;
  private readonly port: number;
  private cleanedUp = false;

  constructor(options: { port: number; dataDir?: string }) {
    this.port = options.port;
    this.cliToken = crypto.randomBytes(32).toString("hex");

    const baseDir =
      options.dataDir ||
      process.env.KANTHA_DATA_DIR ||
      path.resolve(process.cwd(), ".kantha-data");

    if (!fs.existsSync(baseDir)) {
      try {
        fs.mkdirSync(baseDir, { recursive: true, mode: 0o700 });
      } catch {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      // On Windows, restrict base directory permissions from creation
      if (process.platform === "win32") {
        try {
          const username = process.env.USERNAME || process.env.USER;
          if (username) {
            child_process.execSync(
              `icacls "${baseDir}" /inheritance:r /grant:r "${username}:(OI)(CI)(F)"`,
              { stdio: "ignore", timeout: 2000 }
            );
          }
        } catch {
          // ignore
        }
      }
    }

    this.tokenPath = getDaemonTokenPath(this.port, options.dataDir);
    this.persistTokenSecurely();

    // Ensure cleanup hook on process exit
    const exitHandler = () => this.cleanup();
    process.once("exit", exitHandler);
  }

  private persistTokenSecurely(): void {
    try {
      // Defend against symlink and pre-existing file attacks
      if (fs.existsSync(this.tokenPath)) {
        try {
          const stat = fs.lstatSync(this.tokenPath);
          if (stat.isSymbolicLink() || stat.isFile()) {
            fs.unlinkSync(this.tokenPath);
          }
        } catch {
          // ignore
        }
      }

      // 1. Exclusive write (flag: "wx") with restrictive POSIX permissions (0600)
      fs.writeFileSync(this.tokenPath, this.cliToken, {
        encoding: "utf-8",
        mode: 0o600,
        flag: "wx",
      });

      // 2. On Windows, enforce restrictive user-only ACL
      if (process.platform === "win32") {
        try {
          const username = process.env.USERNAME || process.env.USER;
          if (username) {
            child_process.execSync(
              `icacls "${this.tokenPath}" /inheritance:r /grant:r "${username}:(R,W)"`,
              { stdio: "ignore", timeout: 2000 }
            );
          }
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.warn(`[CliCredentialManager] Failed to write secure token file:`, err);
    }
  }

  /**
   * Timing-safe verification of CLI token against candidate.
   */
  verifyCliToken(candidate: string | undefined): boolean {
    if (!candidate || typeof candidate !== "string") {
      return false;
    }

    const candidateBuffer = Buffer.from(candidate, "utf-8");
    const targetBuffer = Buffer.from(this.cliToken, "utf-8");

    if (candidateBuffer.length !== targetBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(candidateBuffer, targetBuffer);
  }

  /**
   * Cleans up token file on daemon shutdown.
   */
  cleanup(): void {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    try {
      if (fs.existsSync(this.tokenPath)) {
        fs.unlinkSync(this.tokenPath);
      }
    } catch {
      // ignore
    }
  }
}
