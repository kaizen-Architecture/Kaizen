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

    // Single-page check (Long-strip webtoons vs scraper placeholder images):
    // A genuine full long-strip webtoon chapter image is large (> 300 KB).
    // Scraper error placeholders, watermarks, or failed 1-page captures are typically small (< 200 KB).
    if (imageEntries.length === 1) {
      const singleEntry = imageEntries[0]!;
      const entrySize = singleEntry.header.size;
      if (stats.size < 300 * 1024 || entrySize < 300 * 1024) {
        return {
          isValid: false,
          reason: `Single-page archive is under 300 KB threshold (disk: ${Math.round(
            stats.size / 1024,
          )} KB, entry: ${Math.round(entrySize / 1024)} KB) - likely scraper placeholder or error banner`,
        };
      }
    } else {
      // Multi-page check: Archive must be at least 50 KB
      if (stats.size < 50 * 1024) {
        return {
          isValid: false,
          reason: `Multi-page archive is under 50 KB threshold (${Math.round(stats.size / 1024)} KB)`,
        };
      }

      // Check for zero-byte or tiny corrupt images inside archive
      let corruptImagesCount = 0;
      for (const entry of imageEntries) {
        if (entry.header.size < 5 * 1024) {
          corruptImagesCount++;
        }
      }

      if (corruptImagesCount === imageEntries.length) {
        return { isValid: false, reason: 'All images inside ZIP archive are smaller than 5 KB (corrupted)' };
      }

      if (corruptImagesCount > imageEntries.length / 2) {
        return {
          isValid: false,
          reason: `Majority of images in archive (${corruptImagesCount}/${imageEntries.length}) are smaller than 5 KB`,
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
