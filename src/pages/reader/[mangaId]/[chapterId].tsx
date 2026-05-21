import { useRouter } from 'next/router';
import {
  Box,
  Group,
  ActionIcon,
  Text,
  useMantineTheme,
  Center,
  Loader,
  Select,
  Slider,
  Tooltip,
  Transition,
  Paper,
  Button,
  Stack,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconStar,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react';
import { useEffect, useState, useRef } from 'react';
import { useMediaQuery, useHotkeys } from '@mantine/hooks';
import Head from 'next/head';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { trpc } from '../../../utils/trpc';

interface Page {
  index: number;
  name: string;
  url: string;
}

export default function ReaderPage() {
  const router = useRouter();
  const { mangaId, chapterId } = router.query;
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm}px)`);
  const { t } = useTranslation('common');

  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [readingDirection, setReadingDirection] = useState<'ltr' | 'rtl' | 'vertical'>('ltr');
  const [fitMode, setFitMode] = useState<'height' | 'width' | 'original'>('height');
  const [showControls, setShowControls] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const mangaQuery = trpc.manga.get.useQuery(
    { id: parseInt(mangaId as string, 10) },
    { enabled: !!mangaId, refetchOnWindowFocus: false },
  );

  // Auto-hide controls function
  const resetControlsTimeout = () => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (readingDirection !== 'vertical') {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  // Toggle controls on screen center click
  const toggleControls = () => {
    setShowControls((prev) => !prev);
  };

  // Preloading helper
  useEffect(() => {
    if (pages.length === 0) return;
    const preloadIndexes = [currentPage + 1, currentPage + 2].filter((idx) => idx < pages.length);
    preloadIndexes.forEach((idx) => {
      const img = new Image();
      img.src = pages[idx].url;
    });
  }, [currentPage, pages]);

  // Load and save reading progress client-side
  useEffect(() => {
    if (!mangaId || !chapterId) return;

    setLoading(true);
    fetch(`/api/v1/mangas/${mangaId}/chapters/${chapterId}/pages`)
      .then((res) => {
        if (!res.ok) throw new Error(t('error_loading_pages', 'Failed to load pages'));
        return res.json();
      })
      .then((data) => {
        setPages(data.pages);
        
        // Restore progress from local storage
        const savedPage = localStorage.getItem(`kaizen-read-progress-${mangaId}-${chapterId}`);
        if (savedPage) {
          const parsed = parseInt(savedPage, 10);
          if (parsed >= 0 && parsed < data.pages.length) {
            setCurrentPage(parsed);
          } else {
            setCurrentPage(0);
          }
        } else {
          setCurrentPage(0);
        }
        
        setLoading(false);
        resetControlsTimeout();
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [mangaId, chapterId, t]);

  // Save current page to local storage
  useEffect(() => {
    if (!mangaId || !chapterId || pages.length === 0) return;
    localStorage.setItem(`kaizen-read-progress-${mangaId}-${chapterId}`, currentPage.toString());
  }, [currentPage, mangaId, chapterId, pages]);

  // Get surrounding chapters
  const getChapterList = () => {
    if (!mangaQuery.data?.chapters) return { prevId: null, nextId: null };
    const chapters = [...mangaQuery.data.chapters].reverse(); // Sort ASC by index (oldest first)
    const currentIndex = chapters.findIndex(
      (c: any) => c.id === parseInt(chapterId as string, 10),
    );
    return {
      prevId: currentIndex > 0 ? chapters[currentIndex - 1].id : null,
      nextId: currentIndex !== -1 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1].id : null,
    };
  };

  const { prevId, nextId } = getChapterList();

  const handleNextChapter = () => {
    if (nextId) {
      router.push(`/reader/${mangaId}/${nextId}`);
    }
  };

  const handlePrevChapter = () => {
    if (prevId) {
      router.push(`/reader/${mangaId}/${prevId}`);
    }
  };

  const goToNextPage = () => {
    resetControlsTimeout();
    if (currentPage < pages.length - 1) {
      setCurrentPage((p) => p + 1);
    } else if (nextId) {
      handleNextChapter();
    }
  };

  const goToPrevPage = () => {
    resetControlsTimeout();
    if (currentPage > 0) {
      setCurrentPage((p) => p - 1);
    } else if (prevId) {
      handlePrevChapter();
    }
  };

  const handleNextAction = readingDirection === 'ltr' ? goToNextPage : goToPrevPage;
  const handlePrevAction = readingDirection === 'ltr' ? goToPrevPage : goToNextPage;

  useHotkeys([
    ['ArrowRight', handleNextAction],
    ['ArrowLeft', handlePrevAction],
    ['Space', handleNextAction],
    ['Backspace', handlePrevAction],
  ]);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  if (loading) {
    return (
      <Center style={{ height: '100vh', backgroundColor: '#090d16' }}>
        <Stack align="center" spacing="md">
          <Loader size="xl" color="indigo" variant="bars" />
          <Text color="dimmed" size="sm">
            {t('loading', 'Loading chapter pages...')}
          </Text>
        </Stack>
      </Center>
    );
  }

  if (error) {
    return (
      <Center style={{ height: '100vh', backgroundColor: '#090d16' }}>
        <Stack align="center" spacing="md" style={{ maxWidth: 400, padding: 20 }}>
          <Text color="red" size="lg" weight={600} align="center">
            {t('error_loading_pages', 'Failed to load pages')}
          </Text>
          <Text color="dimmed" size="sm" align="center">
            {error}
          </Text>
          <Button variant="light" color="indigo" onClick={() => router.push(`/manga/${mangaId}`)}>
            {t('common.back', 'Volver al Manga')}
          </Button>
        </Stack>
      </Center>
    );
  }

  const currentChapter = mangaQuery.data?.chapters.find(
    (c: any) => c.id === parseInt(chapterId as string, 10),
  );

  return (
    <>
      <Head>
        <title>
          {currentChapter ? `${currentChapter.name} - ` : ''} {mangaQuery.data?.title || t('reader', 'Reader')}
        </title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>

      <Box
        sx={{
          position: 'relative',
          width: '100vw',
          height: '100vh',
          backgroundColor: '#07090e',
          overflow: 'hidden',
          color: '#ffffff',
          userSelect: 'none',
        }}
        onMouseMove={resetControlsTimeout}
      >
        {/* Floating Top Header (Glassmorphic) */}
        <Transition mounted={showControls || readingDirection === 'vertical'} transition="slide-down" duration={250}>
          {(styles) => (
            <Paper
              shadow="md"
              style={{
                ...styles,
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 60,
                zIndex: 100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                borderRadius: 0,
                background: 'rgba(10, 15, 30, 0.75)',
                backdropFilter: 'blur(12px)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <Group spacing="sm">
                <ActionIcon 
                  variant="subtle" 
                  color="gray" 
                  size="lg" 
                  onClick={() => router.push(`/manga/${mangaId}`)}
                  sx={{ '&:hover': { background: 'rgba(255, 255, 255, 0.1)' } }}
                >
                  <IconArrowLeft color="#fff" size={22} />
                </ActionIcon>
                <Box>
                  <Text weight={600} size="sm" lineClamp={1} sx={{ maxWidth: isMobile ? 150 : 300, color: '#fff' }}>
                    {mangaQuery.data?.title}
                  </Text>
                  <Text size="xs" color="dimmed" lineClamp={1} sx={{ maxWidth: isMobile ? 150 : 300 }}>
                    {currentChapter?.name || `Capítulo ${currentChapter?.index}`}
                  </Text>
                </Box>
              </Group>

              <Group spacing="xs">
                {/* Favorite Button */}
                <ActionIcon
                  color="yellow"
                  variant="subtle"
                  size="lg"
                  onClick={async () => {
                    if (!mangaQuery.data || !currentChapter) return;
                    const isFav = currentChapter.favoritePages?.includes(currentPage) || false;
                    const newPages = isFav
                      ? currentChapter.favoritePages.filter((p: number) => p !== currentPage)
                      : [...(currentChapter.favoritePages || []), currentPage];
                    await fetch(`/api/v1/mangas/${mangaId}/chapters/${chapterId}/pages`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ favoritePages: newPages }),
                    });
                    mangaQuery.refetch();
                  }}
                  sx={{ '&:hover': { background: 'rgba(255, 255, 255, 0.05)' } }}
                >
                  {currentChapter?.favoritePages?.includes(currentPage) ? (
                    <IconStar fill="gold" color="gold" size={22} />
                  ) : (
                    <IconStar color="#fff" size={22} />
                  )}
                </ActionIcon>

                {/* Fit Mode Selector */}
                {readingDirection !== 'vertical' && (
                  <Select
                    size="xs"
                    data={[
                      { value: 'height', label: t('reader.fitHeight', 'Ajustar Alto') },
                      { value: 'width', label: t('reader.fitWidth', 'Ajustar Ancho') },
                      { value: 'original', label: t('reader.fitOriginal', 'Original') },
                    ]}
                    value={fitMode}
                    onChange={(val) => setFitMode(val as any)}
                    styles={{
                      input: {
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        color: '#fff',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        width: 110,
                      },
                      dropdown: {
                        backgroundColor: '#0f172a',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#fff',
                      },
                      item: {
                        '&[data-selected]': {
                          backgroundColor: theme.colors.indigo[6],
                        },
                        '&[data-hovered]': {
                          backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        },
                      }
                    }}
                  />
                )}

                {/* Direction Selector */}
                <Select
                  size="xs"
                  data={[
                    { value: 'ltr', label: t('left_to_right', 'Izq a Der') },
                    { value: 'rtl', label: t('right_to_left', 'Der a Izq') },
                    { value: 'vertical', label: t('vertical', 'Cascada') },
                  ]}
                  value={readingDirection}
                  onChange={(val) => {
                    setReadingDirection(val as any);
                    if (val === 'vertical') setShowControls(true);
                  }}
                  styles={{
                    input: {
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      color: '#fff',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      width: 95,
                    },
                    dropdown: {
                      backgroundColor: '#0f172a',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                    },
                    item: {
                      '&[data-selected]': {
                        backgroundColor: theme.colors.indigo[6],
                      },
                      '&[data-hovered]': {
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      },
                    }
                  }}
                />
              </Group>
            </Paper>
          )}
        </Transition>

        {/* Main Reading Canvas */}
        <Box
          ref={containerRef}
          onClick={(e) => {
            if (readingDirection === 'vertical') return;
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = e.clientX - rect.left;
            
            // Middle 40% area toggles controls
            if (x > rect.width * 0.3 && x < rect.width * 0.7) {
              toggleControls();
            } else if (x <= rect.width * 0.3) {
              handlePrevAction();
            } else {
              handleNextAction();
            }
          }}
          sx={{
            width: '100%',
            height: '100%',
            display: readingDirection === 'vertical' ? 'block' : 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: readingDirection === 'vertical' ? 'auto' : 'hidden',
            position: 'relative',
            cursor: readingDirection === 'vertical' ? 'default' : 'pointer',
            paddingTop: readingDirection === 'vertical' ? 60 : 0,
            paddingBottom: readingDirection === 'vertical' ? 80 : 0,
          }}
        >
          {pages.length > 0 && readingDirection !== 'vertical' && (
            <Box
              sx={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: isMobile ? '8px' : '24px',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pages[currentPage]?.url}
                alt={`${t('page', 'Page')} ${currentPage + 1}`}
                style={{
                  maxWidth: fitMode === 'height' ? 'none' : '100%',
                  maxHeight: fitMode === 'width' ? 'none' : '100%',
                  width: fitMode === 'width' ? '100%' : 'auto',
                  height: fitMode === 'height' ? '100%' : 'auto',
                  objectFit: 'contain',
                  transition: 'all 0.15s ease-in-out',
                  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
                }}
              />
            </Box>
          )}

          {pages.length > 0 && readingDirection === 'vertical' && (
            <Stack spacing="xs" sx={{ maxWidth: 800, margin: '0 auto', width: '100%', padding: '0 8px' }}>
              {pages.map((page, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={page.name}
                  src={page.url}
                  alt={`${t('page', 'Page')} ${index + 1}`}
                  loading="lazy"
                  style={{
                    maxWidth: '100%',
                    height: 'auto',
                    display: 'block',
                    margin: '0 auto',
                    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.3)',
                    borderRadius: '4px',
                  }}
                />
              ))}
              
              {/* End of chapter vertical navigation */}
              <Paper 
                p="xl" 
                radius="md" 
                align="center" 
                sx={{ 
                  background: 'rgba(255, 255, 255, 0.03)', 
                  border: '1px solid rgba(255,255,255,0.06)',
                  marginTop: 24,
                  marginBottom: 40,
                }}
              >
                <Text size="sm" color="dimmed" mb="md">
                  {t('reader.endChapter', 'Has terminado de leer este capítulo')}
                </Text>
                <Group position="center">
                  <Button
                    variant="light"
                    color="indigo"
                    leftIcon={<IconChevronLeft size={16} />}
                    disabled={!prevId}
                    onClick={handlePrevChapter}
                  >
                    {t('reader.prevChapter', 'Cap. Anterior')}
                  </Button>
                  <Button
                    variant="gradient"
                    gradient={{ from: 'indigo', to: 'violet' }}
                    rightIcon={<IconChevronRight size={16} />}
                    disabled={!nextId}
                    onClick={handleNextChapter}
                  >
                    {t('reader.nextChapter', 'Siguiente Cap.')}
                  </Button>
                </Group>
              </Paper>
            </Stack>
          )}
        </Box>

        {/* Floating Bottom Toolbar (Glassmorphic) */}
        <Transition mounted={showControls && readingDirection !== 'vertical'} transition="slide-up" duration={250}>
          {(styles) => (
            <Paper
              shadow="lg"
              style={{
                ...styles,
                position: 'absolute',
                bottom: 20,
                left: '50%',
                transform: 'translateX(-50%)',
                width: isMobile ? 'calc(100% - 32px)' : 650,
                zIndex: 100,
                borderRadius: 16,
                padding: '12px 24px',
                background: 'rgba(10, 15, 30, 0.8)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <Group position="apart" spacing="md">
                {/* Prev Chapter Icon */}
                <Tooltip label={t('reader.prevChapter', 'Capítulo Anterior')}>
                  <ActionIcon 
                    variant="subtle" 
                    color="gray" 
                    disabled={!prevId} 
                    onClick={handlePrevChapter}
                    sx={{ '&:hover:not(:disabled)': { background: 'rgba(255, 255, 255, 0.08)' } }}
                  >
                    <IconChevronLeft size={20} color={prevId ? '#fff' : 'rgba(255,255,255,0.2)'} />
                  </ActionIcon>
                </Tooltip>

                {/* Slider bar for quick paging */}
                <Box sx={{ flex: 1, padding: '0 8px' }}>
                  <Slider
                    color="indigo"
                    label={(val) => `${t('page', 'Pág.')} ${val}`}
                    min={1}
                    max={pages.length || 1}
                    value={currentPage + 1}
                    onChange={(val) => {
                      setCurrentPage(val - 1);
                      resetControlsTimeout();
                    }}
                    styles={{
                      track: {
                        height: 6,
                        backgroundColor: 'rgba(255, 255, 255, 0.15)',
                      },
                      bar: {
                        height: 6,
                      },
                      thumb: {
                        width: 14,
                        height: 14,
                        border: '2px solid #fff',
                        backgroundColor: theme.colors.indigo[6],
                      }
                    }}
                  />
                </Box>

                {/* Next Chapter Icon */}
                <Tooltip label={t('reader.nextChapter', 'Siguiente Capítulo')}>
                  <ActionIcon 
                    variant="subtle" 
                    color="gray" 
                    disabled={!nextId} 
                    onClick={handleNextChapter}
                    sx={{ '&:hover:not(:disabled)': { background: 'rgba(255, 255, 255, 0.08)' } }}
                  >
                    <IconChevronRight size={20} color={nextId ? '#fff' : 'rgba(255,255,255,0.2)'} />
                  </ActionIcon>
                </Tooltip>
              </Group>

              {/* Status and quick navigation info */}
              <Group position="apart" sx={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 12 }}>
                <Text size="xs">
                  {prevId ? t('reader.hasPrev', '← Cap. Anterior') : ''}
                </Text>
                <Text size="xs" weight={500}>
                  {currentPage + 1} / {pages.length}
                </Text>
                <Text size="xs">
                  {nextId ? t('reader.hasNext', 'Siguiente Cap. →') : ''}
                </Text>
              </Group>
            </Paper>
          )}
        </Transition>
      </Box>
    </>
  );
}

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common', 'manga'])),
    },
  };
}
