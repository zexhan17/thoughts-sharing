import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import type { ExportData } from "./types";

const HASH_PREFIX = "share=";

export function encodeThought(data: ExportData): string {
  return compressToEncodedURIComponent(JSON.stringify(data));
}

export function buildShareUrl(data: ExportData): string {
  return `${window.location.origin}${window.location.pathname}#${HASH_PREFIX}${encodeThought(data)}`;
}

export function decodeShareHash(hash: string): ExportData | null {
  try {
    if (!hash.startsWith("#" + HASH_PREFIX)) return null;
    const encoded = hash.slice(1 + HASH_PREFIX.length);
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const data = JSON.parse(json) as ExportData;
    if (data.version !== 1 || !data.thought) return null;
    return data;
  } catch {
    return null;
  }
}

// Deduplicate: check if root thought's createdAt already exists
export function isAlreadyImported(data: ExportData, nodeCreatedAts: Set<string>): boolean {
  return nodeCreatedAts.has(data.thought.createdAt);
}
