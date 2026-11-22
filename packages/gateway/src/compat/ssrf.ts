import dns from "node:dns/promises";
import net from "node:net";

export class SsrfError extends Error {
  readonly _tag = "SsrfError";
  constructor(message: string) {
    super(`SSRF Protection: ${message}`);
    this.name = "SsrfError";
  }
}

export interface SsrfOptions {
  isLocal?: boolean;
  allowPrivateNetwork?: boolean;
}

function isLoopbackIp(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip.startsWith("127.");
}

function isCloudMetadataIp(ip: string): boolean {
  return ip === "169.254.169.254";
}

function isZeroNetworkIp(ip: string): boolean {
  return ip === "0.0.0.0" || ip.startsWith("0.") || ip === "::";
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return false;
  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  // 169.254.0.0/16 (Link-local)
  if (parts[0] === 169 && parts[1] === 254) return true;

  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  // fc00::/7 (Unique Local Address)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  // fe80::/10 (Link-Local)
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  return false;
}

function checkIpAddress(ip: string, opts: SsrfOptions): void {
  const normalized = ip.toLowerCase();

  // Check IPv4-mapped IPv6 (::ffff:x.x.x.x or ::ffff:hhhh:hhhh)
  if (normalized.startsWith("::ffff:")) {
    const remainder = normalized.slice(7);
    if (net.isIPv4(remainder)) {
      checkIpAddress(remainder, opts);
      return;
    }
    // Handle hex words like a9fe:a9fe
    const hexParts = remainder.split(":");
    if (hexParts.length === 2) {
      const h1 = hexParts[0].padStart(4, "0");
      const h2 = hexParts[1].padStart(4, "0");
      const b1 = parseInt(h1.slice(0, 2), 16);
      const b2 = parseInt(h1.slice(2, 4), 16);
      const b3 = parseInt(h2.slice(0, 2), 16);
      const b4 = parseInt(h2.slice(2, 4), 16);
      if (!isNaN(b1) && !isNaN(b2) && !isNaN(b3) && !isNaN(b4)) {
        const v4Mapped = `${b1}.${b2}.${b3}.${b4}`;
        checkIpAddress(v4Mapped, opts);
        return;
      }
    }
  }

  // Cloud metadata is unconditionally blocked
  if (isCloudMetadataIp(ip)) {
    throw new SsrfError(`Access to cloud metadata IP ${ip} is blocked`);
  }

  // Zero network is unconditionally blocked
  if (isZeroNetworkIp(ip)) {
    throw new SsrfError(`Access to zero network ${ip} is blocked`);
  }

  // Loopback
  if (isLoopbackIp(ip)) {
    if (!opts.isLocal) {
      throw new SsrfError(`Loopback IP ${ip} is only allowed when isLocal: true`);
    }
    return;
  }

  // Private network checks
  if (net.isIPv4(ip) && isPrivateIpv4(ip)) {
    if (!opts.allowPrivateNetwork) {
      throw new SsrfError(`Private network IP ${ip} is only allowed when allowPrivateNetwork: true`);
    }
    return;
  }

  if (net.isIPv6(ip) && isPrivateIpv6(ip)) {
    if (!opts.allowPrivateNetwork) {
      throw new SsrfError(`Private IPv6 network ${ip} is only allowed when allowPrivateNetwork: true`);
    }
    return;
  }
}

/**
 * Validates target endpoint URL against SSRF and DNS rebinding attacks.
 * Resolves all DNS records and rejects private/metadata IPs unless explicitly permitted.
 */
export async function validateEndpointUrl(urlString: string, opts: SsrfOptions = {}): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new SsrfError(`Invalid URL string: ${urlString}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfError(`Unsupported protocol scheme: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, ""); // Strip IPv6 brackets

  // Direct localhost or loopback name check
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    if (!opts.isLocal) {
      throw new SsrfError(`Loopback host ${hostname} is only allowed when isLocal: true`);
    }
    return;
  }

  // If hostname is directly an IP literal
  if (net.isIP(hostname)) {
    checkIpAddress(hostname, opts);
    return;
  }

  // Resolve all DNS records
  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records || records.length === 0) {
      throw new SsrfError(`DNS lookup returned no records for host ${hostname}`);
    }

    for (const record of records) {
      checkIpAddress(record.address, opts);
    }
  } catch (err: any) {
    if (err instanceof SsrfError) throw err;
    throw new SsrfError(`DNS resolution failed for host ${hostname}: ${err.message || String(err)}`);
  }
}
