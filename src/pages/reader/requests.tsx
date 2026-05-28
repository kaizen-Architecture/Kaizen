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
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
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
        message: 'Por favor, introduce un título para el manga.',
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
        title: 'Solicitud enviada',
        message: `Se ha registrado tu solicitud para "${titleInput}" correctamente.`,
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
            Disponible
          </Badge>
        );
      case 'APPROVED':
        return (
          <Badge color="blue" variant="filled">
            Aprobada
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge color="red" variant="filled">
            Cancelada
          </Badge>
        );
      default:
        return (
          <Badge color="yellow" variant="filled">
            Pendiente
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
              Solicitudes de Lectura
            </Text>
            <Text color="dimmed" size="sm">
              ¿Quieres leer algún manga que no está en la biblioteca? Solicítalo aquí y un administrador lo revisará.
            </Text>
          </Box>

          <Grid gutter="xl">
            {/* Form Column */}
            <Grid.Col xs={12} md={4}>
              <Paper withBorder p="md" radius="md">
                <Text weight={600} mb="md">
                  Nueva Solicitud
                </Text>
                <form onSubmit={handleSubmit}>
                  <Stack spacing="md">
                    <TextInput
                      label="Título del Manga"
                      placeholder="Ej: Solo Leveling, Monster..."
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.currentTarget.value)}
                      required
                    />
                    <NumberInput
                      label="Capítulo de Inicio"
                      description="Desde qué capítulo quieres empezar a leer"
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
                      Enviar Solicitud
                    </Button>
                  </Stack>
                </form>
              </Paper>
            </Grid.Col>

            {/* List Column */}
            <Grid.Col xs={12} md={8}>
              <Paper withBorder p="md" radius="md">
                <Text weight={600} mb="md">
                  Mis Solicitudes
                </Text>
                <Box sx={{ position: 'relative' }}>
                  <LoadingOverlay visible={requestsQuery.isLoading} />
                  <Table verticalSpacing="sm" highlightOnHover>
                    <thead>
                      <tr>
                        <th>Título del Manga</th>
                        <th>Capítulo de Inicio</th>
                        <th>Estado</th>
                        <th>Fecha</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requestsQuery.data?.map((req) => (
                        <tr key={req.id}>
                          <td style={{ fontWeight: 500 }}>{req.title}</td>
                          <td>Capítulo {req.startChapter}</td>
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
                                Leer ahora
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
                            <Text color="dimmed">No has realizado ninguna solicitud todavía.</Text>
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
  return {
    props: {
      ...(await serverSideTranslations(locale || 'en', ['common', 'library', 'settings'])),
    },
  };
}
