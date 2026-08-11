import AdmZip from 'adm-zip';
import fs from 'fs';
import { logger } from '../../utils/logging';

export interface IntegrityCheckResult {
  isValid: boolean;
  reason?: string;
  entryCount?: number;
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
    // Any valid CBZ image archive with at least 1 page is usually > 5KB.
    // Files < 1KB are almost certainly 0-byte or text error responses.
    if (stats.size < 1024) {
      return { isValid: false, reason: `File size too small (${stats.size} bytes)` };
    }

    // Try reading file header to detect HTML error page saved directly
    const buffer = Buffer.alloc(100);
    const fd = await fs.promises.open(filePath, 'r');
    await fd.read(buffer, 0, 100, 0);
    await fd.close();

    const headerStr = buffer.toString('utf8').trim().toLowerCase();
    if (
      headerStr.includes('<!doctype') ||
      headerStr.includes('<html') ||
      headerStr.includes('403 forbidden') ||
      headerStr.includes('404 not found') ||
      headerStr.includes('cloudflare')
    ) {
      return { isValid: false, reason: 'File contains HTML error page instead of ZIP archive' };
    }

    // Attempt parsing as ZIP archive with adm-zip
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();

    if (!zipEntries || zipEntries.length === 0) {
      return { isValid: false, reason: 'ZIP archive contains no entries' };
    }

    // Filter valid image entries (.jpg, .jpeg, .png, .webp, .gif, .bmp)
    const validImageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
    const imageEntries = zipEntries.filter((entry) => {
      if (entry.isDirectory) return false;
      const lowerName = entry.entryName.toLowerCase();
      return validImageExtensions.some((ext) => lowerName.endsWith(ext));
    });

    if (imageEntries.length === 0) {
      return { isValid: false, reason: 'ZIP archive contains no recognized image files' };
    }

    // Check size of image entries to ensure they aren't empty / 0-byte
    let corruptImagesCount = 0;
    for (const entry of imageEntries) {
      if (entry.header.size < 100) {
        corruptImagesCount++;
      }
    }

    if (corruptImagesCount === imageEntries.length) {
      return { isValid: false, reason: 'All images inside ZIP archive are zero-byte or corrupted' };
    }

    return { isValid: true, entryCount: imageEntries.length };
  } catch (err: any) {
    logger.warn(`validateCbzIntegrity failed for ${filePath}: ${err?.message || err}`);
    return { isValid: false, reason: err?.message || 'Corrupt or unreadable ZIP header' };
  }
}
