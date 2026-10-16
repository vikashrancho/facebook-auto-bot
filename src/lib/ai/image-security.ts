/**
 * Network and payload security utilities for remote image ingestion.
 * Provides SSRF protection against private/loopback/cloud-metadata networks
 * and validates magic bytes / file signatures for JPEG, PNG, and WebP images.
 */

/**
 * Checks if an IP is in a private, loopback, link-local, or restricted cloud range.
 */
export function isRestrictedIp(ip: string): boolean {
  // IPv4 checks
  if (ip.includes(".")) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) return true;
    if (parts[0] === 0) return true; // 0.0.0.0/8
    if (parts[0] === 10) return true; // 10.0.0.0/8
    if (parts[0] === 127) return true; // 127.0.0.0/8 loopback
    if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16 link-local & cloud metadata (169.254.169.254)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true; // 100.64.0.0/10 CGNAT
    if (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) return true; // 192.0.2.0/24
    if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true; // 198.51.100.0/24
    if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true; // 203.0.113.0/24
    if (parts[0] >= 224) return true; // Multicast & reserved (224.0.0.0/4, 240.0.0.0/4)
    return false;
  }

  // IPv6 checks
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
  if (lower === "::" || lower === "0:0:0:0:0:0:0:0") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  ) {
    return true; // Link-local
  }
  if (lower.startsWith("ff")) return true; // Multicast
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice(7);
    return isRestrictedIp(v4);
  }
  return false;
}

/**
 * Validates magic bytes / file signatures to guarantee authentic image content.
 * Rejects scripts, HTML, or malformed bytes pretending to be image files.
 */
export function detectImageSignature(
  buffer: Buffer
): { ext: string; contentType: string } | null {
  if (buffer.length < 8) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: "jpg", contentType: "image/jpeg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: "png", contentType: "image/png" };
  }

  // WebP: RIFF (4 bytes) + size (4 bytes) + WEBP (4 bytes)
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { ext: "webp", contentType: "image/webp" };
  }

  return null;
}
