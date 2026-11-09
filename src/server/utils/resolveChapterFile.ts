import path from 'path';
import fs from 'fs';
import { sanitizer } from '../../utils';
import { getMangaPath } from './mangal';

export interface ResolveChapterInputManga {
  title: string;
  library: {
    path: string;
  };
  sources?: Array<{
    title: string;
  }>;
}

export interface ResolveChapterInputChapter {
  fileName: string;
}

export interface ResolveChapterFileResult {
  cbzPath: string;
  mangaDir: string;
  exists: boolean;
  isSafe: boolean;
}

/**
 * Resolves the physical path of a chapter archive file (.cbz / .zip / .pdf)
 * using the canonical directory, alternative source titles, fuzzy library search,
 * and auto-heals files into the canonical folder.
 * Also verifies path traversal safety against the library directory.
 */
export function resolveChapterFile(
  manga: ResolveChapterInputManga,
  chapter: ResolveChapterInputChapter,
): ResolveChapterFileResult {
  let mangaDir = getMangaPath(manga.library.path, manga.title);
  let cbzPath = path.join(mangaDir, chapter.fileName);

  if (!fs.existsSync(cbzPath)) {
    const rawDir = path.resolve(manga.library.path, manga.title);
    if (fs.existsSync(path.join(rawDir, chapter.fileName))) {
      mangaDir = rawDir;
      cbzPath = path.join(mangaDir, chapter.fileName);
    } else if (manga.sources && manga.sources.length > 0) {
      // Fallback A: Check directories named after alternative source titles
      for (const s of manga.sources) {
        const altCandidates = [
          path.join(manga.library.path, sanitizer(s.title), chapter.fileName),
          path.join(manga.library.path, s.title, chapter.fileName),
        ];
        for (const cand of altCandidates) {
          if (fs.existsSync(cand)) {
            cbzPath = cand;
            break;
          }
        }
        if (fs.existsSync(cbzPath)) break;
      }
    }

    if (!fs.existsSync(cbzPath) && fs.existsSync(manga.library.path)) {
      // Fallback B: Fuzzy search across library subdirectories for the chapter file
      try {
        const subdirs = fs.readdirSync(manga.library.path);
        const cleanCanonical = manga.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const d of subdirs) {
          const cleanD = d.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (
            cleanD.includes(cleanCanonical) ||
            cleanCanonical.includes(cleanD) ||
            (cleanCanonical.length >= 6 && cleanD.slice(0, 8) === cleanCanonical.slice(0, 8))
          ) {
            const cand = path.join(manga.library.path, d, chapter.fileName);
            if (fs.existsSync(cand)) {
              cbzPath = cand;
              break;
            }
          }
        }
      } catch {
        // ignore directory traversal errors
      }
    }

    if (!fs.existsSync(cbzPath)) {
      const baseName = chapter.fileName.replace(/\.[^/.]+$/, '');
      for (const ext of ['.cbz', '.zip', '.pdf']) {
        const altCandidate = path.join(mangaDir, `${baseName}${ext}`);
        if (fs.existsSync(altCandidate)) {
          cbzPath = altCandidate;
          break;
        }
      }
    }

    // Auto-Heal: If found in an alternative directory, move it into the canonical folder
    if (fs.existsSync(cbzPath) && path.resolve(cbzPath) !== path.resolve(path.join(mangaDir, chapter.fileName))) {
      try {
        const canonicalTarget = path.join(mangaDir, chapter.fileName);
        fs.mkdirSync(mangaDir, { recursive: true });
        fs.renameSync(cbzPath, canonicalTarget);
        cbzPath = canonicalTarget;
      } catch {
        // If rename fails, keep serving from cbzPath
      }
    }
  }

  const resolvedCbz = path.resolve(cbzPath);
  const resolvedLibrary = path.resolve(manga.library.path);
  const isSafe = resolvedCbz.startsWith(resolvedLibrary + path.sep) || resolvedCbz === resolvedLibrary;
  const exists = isSafe && fs.existsSync(cbzPath);

  return {
    cbzPath,
    mangaDir,
    exists,
    isSafe,
  };
}
