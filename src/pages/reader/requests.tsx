import {
  Container,
  Box,
  Text,
  Paper,
  TextInput,
  NumberInput,
  Button,
  Table,
  Badge,
  Stack,
  ScrollArea,
  LoadingOverlay,
  Grid,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { IconCheck, IconX, IconPlus, IconExternalLink } from '@tabler/icons-react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { trpc } from '../../utils/trpc';

export default function ReaderRequestsPage() {
  const { t } = useTranslation(['common', 'library']);
  const [isMounted, setIsMounted] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [startChapterInput, setStartChapterInput] = useState<number>(1);

  const requestsQuery = trpc.mangaRequest.list.useQuery();
  const createRequestMutation = trpc.mangaRequest.create.useMutation();

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleInput.trim()) {
      showNotification({
        title: t('common:error', 'Error'),
        message: t('common:requests.errorTitleEmpty', 'Por favor, introduce un título para el manga.'),
        color: 'red',
        icon: <IconX size={18} />,
      });
      return;
    }

    try {
      await createRequestMutation.mutateAsync({
        title: titleInput.trim(),
        startChapter: startChapterInput,
      });

      showNotification({
        title: t('common:requests.successTitle', 'Solicitud enviada'),
        message: t('common:requests.successMessage', {
          title: titleInput,
          defaultValue: `Se ha registrado tu solicitud para "${titleInput}" correctamente.`,
        }),
        color: 'teal',
        icon: <IconCheck size={18} />,
      });

      setTitleInput('');
      setStartChapterInput(1);
      requestsQuery.refetch();
    } catch (err) {
      showNotification({
        title: t('common:error', 'Error'),
        message: `${err}`,
        color: 'red',
        icon: <IconX size={18} />,
      });
    }
  };

  if (!isMounted) {
    return (
      <Box sx={{ width: '100%', height: 'calc(100dvh - 88px)', position: 'relative' }}>
        <LoadingOverlay visible />
      </Box>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return (
          <Badge color="green" variant="filled">
            {t('common:requests.statusAvailable', 'Disponible')}
          </Badge>
        );
      case 'APPROVED':
        return (
          <Badge color="blue" variant="filled">
            {t('common:requests.statusApproved', 'Aprobada')}
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge color="red" variant="filled">
            {t('common:requests.statusCancelled', 'Cancelada')}
          </Badge>
        );
      default:
        return (
          <Badge color="yellow" variant="filled">
            {t('common:requests.statusPending', 'Pendiente')}
          </Badge>
        );
    }
  };

  return (
    <ScrollArea sx={{ minHeight: 'calc(100dvh - 88px)' }}>
      <Container size="lg" py="xl">
        <Stack spacing="lg">
          <Box>
            <Text size="xl" weight={700} sx={{ letterSpacing: -0.5 }}>
              {t('common:requests.title', 'Solicitudes de Lectura')}
            </Text>
            <Text color="dimmed" size="sm">
              {t(
                'common:requests.description',
                '¿Quieres leer algún manga que no está en la biblioteca? Solicítalo aquí y un administrador lo revisará.',
              )}
            </Text>
          </Box>

          <Grid gutter="xl">
            {/* Form Column */}
            <Grid.Col xs={12} md={4}>
              <Paper withBorder p="md" radius="md">
                <Text weight={600} mb="md">
                  {t('common:requests.newRequest', 'Nueva Solicitud')}
                </Text>
                <form onSubmit={handleSubmit}>
                  <Stack spacing="md">
                    <TextInput
                      label={t('common:requests.mangaTitle', 'Título del Manga')}
                      placeholder={t('common:requests.mangaTitlePlaceholder', 'Ej: Solo Leveling, Monster...')}
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.currentTarget.value)}
                      required
                    />
                    <NumberInput
                      label={t('common:requests.startChapter', 'Capítulo de Inicio')}
                      description={t(
                        'common:requests.startChapterDesc',
                        'A partir de qué capítulo publicado quieres tenerlo disponible para leer.',
                      )}
                      min={1}
                      value={startChapterInput}
                      onChange={(val) => setStartChapterInput(val || 1)}
                    />
                    <Button
                      type="submit"
                      loading={createRequestMutation.isLoading}
                      leftIcon={<IconPlus size={16} />}
                      fullWidth
                    >
                      {t('common:requests.sendRequest', 'Enviar Solicitud')}
                    </Button>
                  </Stack>
                </form>
              </Paper>
            </Grid.Col>

            {/* List Column */}
            <Grid.Col xs={12} md={8}>
              <Paper withBorder p="md" radius="md">
                <Text weight={600} mb="md">
                  {t('common:requests.myRequests', 'Mis Solicitudes')}
                </Text>
                <Box sx={{ position: 'relative' }}>
                  <LoadingOverlay visible={requestsQuery.isLoading} />
                  <Table verticalSpacing="sm" highlightOnHover>
                    <thead>
                      <tr>
                        <th>{t('common:requests.mangaTitle', 'Título del Manga')}</th>
                        <th>{t('common:requests.startChapter', 'Capítulo de Inicio')}</th>
                        <th>{t('common:requests.status', 'Estado')}</th>
                        <th>{t('common:requests.date', 'Fecha')}</th>
                        <th>{t('common:requests.action', 'Acción')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requestsQuery.data?.map((req) => (
                        <tr key={req.id}>
                          <td style={{ fontWeight: 500 }}>{req.title}</td>
                          <td>
                            {t('common:requests.chapterPrefix', {
                              num: req.startChapter,
                              defaultValue: `Capítulo ${req.startChapter}`,
                            })}
                          </td>
                          <td>{getStatusBadge(req.status)}</td>
                          <td>{new Date(req.createdAt).toLocaleDateString()}</td>
                          <td>
                            {req.status === 'AVAILABLE' ? (
                              <Button
                                size="xs"
                                variant="light"
                                color="green"
                                rightIcon={<IconExternalLink size={12} />}
                                onClick={async () => {
                                  // We find the manga with the same title to redirect to it
                                  // In library, redirecting to search or to manga details
                                  window.location.href = `/reader/library?search=${encodeURIComponent(req.title)}`;
                                }}
                              >
                                {t('common:requests.readNow', 'Leer ahora')}
                              </Button>
                            ) : (
                              <Text size="xs" color="dimmed">
                                -
                              </Text>
                            )}
                          </td>
                        </tr>
                      ))}
                      {(!requestsQuery.data || requestsQuery.data.length === 0) && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '24px' }}>
                            <Text color="dimmed">
                              {t('common:requests.empty', 'No has realizado ninguna solicitud todavía.')}
                            </Text>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                </Box>
              </Paper>
            </Grid.Col>
          </Grid>
        </Stack>
      </Container>
    </ScrollArea>
  );
}

export async function getServerSideProps({ locale }: { locale?: string }) {
  const { serverSideTranslations } = await import('next-i18next/serverSideTranslations');
  return {
    props: {
      ...(await serverSideTranslations(locale || 'en', ['common', 'library', 'settings'])),
    },
  };
}
