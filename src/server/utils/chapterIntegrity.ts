import AdmZip from 'adm-zip';
import fs from 'fs';
import { logger } from '../../utils/logging';

export interface IntegrityCheckResult {
  isValid: boolean;
  reason?: string;
  entryCount?: number;
  fileSizeBytes?: number;
  firstPageBase64?: string;
  firstPageFileName?: string;
}

/**
 * Validates a .cbz (ZIP) file on disk to ensure it is not corrupt, zero-byte,
 * or an HTML error page (e.g. 403 / 404 / Cloudflare challenge) saved as an archive.
 */
export async function validateCbzIntegrity(filePath: string): Promise<IntegrityCheckResult> {
  try {
    if (!fs.existsSync(filePath)) {
      return { isValid: false, reason: 'File does not exist on disk' };
    }

    const stats = await fs.promises.stat(filePath);
    // Files < 10KB are almost certainly 0-byte, text error responses, or broken captures.
    if (stats.size < 10 * 1024) {
      return { isValid: false, reason: `File size too small (${stats.size} bytes < 10 KB threshold)` };
    }

    // Read the first 100 bytes of the file
    const buffer = Buffer.alloc(100);
    const fd = await fs.promises.open(filePath, 'r');
    await fd.read(buffer, 0, 100, 0);
    await fd.close();

    // Check if the file starts with ZIP magic bytes (PK\x03\x04, PK\x05\x06, or PK\x07\x08)
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;

    if (!isZip) {
      const headerStr = buffer.toString('utf8').trim().toLowerCase();
      if (
        headerStr.includes('<!doctype') ||
        headerStr.includes('<html') ||
        headerStr.includes('403 forbidden') ||
        headerStr.includes('404 not found') ||
        headerStr.includes('502 bad gateway') ||
        headerStr.includes('503 service') ||
        headerStr.includes('cloudflare')
      ) {
        return { isValid: false, reason: 'File contains HTML error page instead of ZIP archive' };
      }
      return { isValid: false, reason: 'File is not a valid ZIP archive (missing PK header)' };
    }

    // Attempt parsing as ZIP archive with adm-zip
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();

    if (!zipEntries || zipEntries.length === 0) {
      return { isValid: false, reason: 'ZIP archive contains no entries' };
    }

    // Filter valid image entries (.jpg, .jpeg, .png, .webp, .avif, .gif, .bmp)
    const validImageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.bmp'];
    const imageEntries = zipEntries.filter((entry) => {
      if (entry.isDirectory) return false;
      const lowerName = entry.entryName.toLowerCase();
      return validImageExtensions.some((ext) => lowerName.endsWith(ext));
    });

    if (imageEntries.length === 0) {
      return { isValid: false, reason: 'ZIP archive contains no recognized image files' };
    }

    // Verify that entries have actual image content (not empty/0-byte placeholders)
    const validEntries = imageEntries.filter((entry) => entry.header.size > 100);
    if (validEntries.length === 0) {
      return { isValid: false, reason: 'All images inside ZIP archive are empty/zero-byte (corrupted)' };
    }

    // Single-page check (Long-strip webtoons vs scraper placeholder images):
    // A genuine full long-strip webtoon chapter image is large.
    // Scraper error placeholders, watermarks, or failed 1-page captures are typically small.
    if (imageEntries.length === 1) {
      const singleEntry = imageEntries[0]!;
      const entrySize = singleEntry.header.size;
      if (stats.size < 100 * 1024 || entrySize < 100 * 1024) {
        return {
          isValid: false,
          reason: `Single-page archive is under 100 KB threshold (disk: ${Math.round(
            stats.size / 1024,
          )} KB, entry: ${Math.round(entrySize / 1024)} KB) - likely scraper placeholder or error banner`,
        };
      }
    }

    // Sort image entries numerically/alphabetically to pick Page 1
    imageEntries.sort((a, b) =>
      a.entryName.localeCompare(b.entryName, undefined, { numeric: true, sensitivity: 'base' }),
    );

    const firstEntry = imageEntries[0];
    let firstPageBase64: string | undefined = undefined;
    let firstPageFileName: string | undefined = undefined;

    if (firstEntry) {
      firstPageFileName = firstEntry.entryName;
      try {
        const entryData = firstEntry.getData();
        const lower = firstEntry.entryName.toLowerCase();
        let mime = 'image/jpeg';
        if (lower.endsWith('.png')) mime = 'image/png';
        else if (lower.endsWith('.webp')) mime = 'image/webp';
        else if (lower.endsWith('.gif')) mime = 'image/gif';

        firstPageBase64 = `data:${mime};base64,${entryData.toString('base64')}`;
      } catch (e) {
        logger.warn(`Failed to extract first page base64 preview: ${e}`);
      }
    }

    return {
      isValid: true,
      entryCount: imageEntries.length,
      fileSizeBytes: stats.size,
      firstPageBase64,
      firstPageFileName,
    };
  } catch (err: any) {
    logger.warn(`validateCbzIntegrity failed for ${filePath}: ${err?.message || err}`);
    return { isValid: false, reason: err?.message || 'Corrupt or unreadable ZIP header' };
  }
}
