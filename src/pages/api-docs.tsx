import {
  Box,
  Container,
  Paper,
  Stack,
  Title,
  Text,
  Button,
  Group,
  ThemeIcon,
  Table,
  Code,
  Badge,
  Divider,
  List,
} from '@mantine/core';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { IconChevronLeft, IconTerminal, IconBook, IconKey } from '@tabler/icons-react';
import { ApiExplorer } from '../components/kaizen/ApiExplorer';

export default function ApiDocs() {
  const router = useRouter();
  const { t } = useTranslation('settings');

  return (
    <>
      <Head>
        <title>{t('auth.docsTitle', 'Documentación de la API REST - Kaizen')}</title>
        <meta name="viewport" content="minimum-scale=1, initial-scale=1, width=device-width" />
      </Head>

      <Container size="xl" py="md">
        <Stack spacing="lg">
          {/* Premium Header */}
          <Paper
            p="xl"
            radius="md"
            sx={(theme) => ({
              background:
                theme.colorScheme === 'dark'
                  ? 'linear-gradient(135deg, rgba(30, 27, 75, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%)'
                  : 'linear-gradient(135deg, rgba(238, 242, 255, 0.5) 0%, rgba(255, 255, 255, 0.8) 100%)',
              border: `1px solid ${theme.colorScheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
              backdropFilter: 'blur(8px)',
            })}
          >
            <Group position="apart" align="center">
              <Group spacing="md">
                <ThemeIcon size={44} radius="md" color="indigo" variant="light">
                  <IconTerminal size={24} />
                </ThemeIcon>
                <Box>
                  <Title order={2} sx={{ fontSize: 22, fontWeight: 800 }}>
                    {t('auth.docsHeader', 'Documentación de la API REST')}
                  </Title>
                  <Text size="xs" color="dimmed">
                    {t('auth.docsSubheader', 'Explora y prueba las rutas de la API REST de Kaizen en tiempo real')}
                  </Text>
                </Box>
              </Group>
              <Button
                variant="subtle"
                leftIcon={<IconChevronLeft size={16} />}
                onClick={() => router.push('/settings')}
                color="indigo"
              >
                {t('common.back', 'Volver')}
              </Button>
            </Group>
          </Paper>

          {/* Interactive API Tester Panel */}
          <Paper
            p="xl"
            radius="md"
            withBorder
            shadow="md"
            sx={(theme) => ({
              backgroundColor: theme.colorScheme === 'dark' ? '#1e293b' : '#ffffff',
              borderColor: theme.colorScheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
            })}
          >
            <ApiExplorer />
          </Paper>

          {/* Structured Reference Section */}
          <Paper
            p="xl"
            radius="md"
            withBorder
            shadow="md"
            sx={(theme) => ({
              backgroundColor: theme.colorScheme === 'dark' ? '#1e293b' : '#ffffff',
              borderColor: theme.colorScheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
            })}
          >
            <Stack spacing="lg">
              <Group spacing="sm">
                <IconBook size={22} style={{ color: '#6366f1' }} />
                <Title order={4}>Referencia Técnica de Endpoints</Title>
              </Group>
              <Text size="xs" color="dimmed">
                La API REST de Kaizen permite a desarrolladores y scripts de terceros consultar de forma automatizada
                los contenidos de la biblioteca local.
              </Text>

              <Divider opacity={0.1} />

              <Stack spacing="lg">
                <Group spacing="xs" sx={{ flexWrap: 'wrap' }}>
                  <Badge color="blue" size="lg" radius="sm">
                    GET
                  </Badge>
                  <Code sx={{ fontSize: 14, fontWeight: 700 }}>/api/v1/mangas</Code>
                  <Text size="sm" color="dimmed">
                    - Obtener catálogo de mangas con filtros avanzados y progreso de lectura
                  </Text>
                </Group>

                <Box sx={{ overflowX: 'auto' }}>
                  <Table verticalSpacing="xs" fontSize="xs" highlightOnHover>
                    <thead>
                      <tr>
                        <th>Parámetro</th>
                        <th>Tipo</th>
                        <th>Ubicación</th>
                        <th>Requerido</th>
                        <th>Descripción</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          <Code>Authorization</Code>
                        </td>
                        <td>
                          <Text size="xs" color="dimmed">
                            string
                          </Text>
                        </td>
                        <td>Header</td>
                        <td>Sí</td>
                        <td>
                          Formato: <Code>Bearer &lt;API_TOKEN&gt;</Code>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <Code>genre</Code>
                        </td>
                        <td>
                          <Text size="xs" color="dimmed">
                            string | string[]
                          </Text>
                        </td>
                        <td>Query</td>
                        <td>No</td>
                        <td>Filtra los mangas por uno o varios géneros coincidentes</td>
                      </tr>
                      <tr>
                        <td>
                          <Code>author</Code>
                        </td>
                        <td>
                          <Text size="xs" color="dimmed">
                            string | string[]
                          </Text>
                        </td>
                        <td>Query</td>
                        <td>No</td>
                        <td>Filtra los mangas por uno o varios autores coincidentes</td>
                      </tr>
                      <tr>
                        <td>
                          <Code>status</Code>
                        </td>
                        <td>
                          <Text size="xs" color="dimmed">
                            string
                          </Text>
                        </td>
                        <td>Query</td>
                        <td>No</td>
                        <td>
                          Filtra por estado del manga (ej: <Code>Ongoing</Code>, <Code>Completed</Code>)
                        </td>
                      </tr>
                    </tbody>
                  </Table>
                </Box>

                <Text size="xs" weight={600} mt="xs">
                  Respuesta Exitosa (200 OK):
                </Text>
                <Code block color="gray" sx={{ fontSize: 11 }}>
                  {`[
  {
    "id": 1,
    "title": "Manga Name",
    "source": "asuratoon",
    "genres": ["Action", "Adventure"],
    "authors": ["Author Name"],
    "status": "ONGOING",
    "readingStatus": {
      "totalChapters": 120,
      "readChapters": 95,
      "unreadChapters": 25,
      "percentageComplete": 79,
      "isFullyRead": false
    }
  }
]`}
                </Code>
              </Stack>

              <Divider opacity={0.1} />

              <Stack spacing="md">
                <Group spacing="xs" sx={{ flexWrap: 'wrap' }}>
                  <Badge color="blue" size="lg" radius="sm">
                    GET
                  </Badge>
                  <Code sx={{ fontSize: 14, fontWeight: 700 }}>/api/v1/mangas/{'{id}'}</Code>
                  <Text size="sm" color="dimmed">
                    - Obtener detalles del manga y el listado de capítulos con estado de lectura
                  </Text>
                </Group>

                <Box sx={{ overflowX: 'auto' }}>
                  <Table verticalSpacing="xs" fontSize="xs" highlightOnHover>
                    <thead>
                      <tr>
                        <th>Parámetro</th>
                        <th>Tipo</th>
                        <th>Ubicación</th>
                        <th>Requerido</th>
                        <th>Descripción</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          <Code>id</Code>
                        </td>
                        <td>
                          <Text size="xs" color="dimmed">
                            integer
                          </Text>
                        </td>
                        <td>Path</td>
                        <td>Sí</td>
                        <td>Identificador único del manga</td>
                      </tr>
                      <tr>
                        <td>
                          <Code>Authorization</Code>
                        </td>
                        <td>
                          <Text size="xs" color="dimmed">
                            string
                          </Text>
                        </td>
                        <td>Header</td>
                        <td>Sí</td>
                        <td>
                          Formato: <Code>Bearer &lt;API_TOKEN&gt;</Code>
                        </td>
                      </tr>
                    </tbody>
                  </Table>
                </Box>

                <Text size="xs" weight={600} mt="xs">
                  Respuesta Exitosa (200 OK):
                </Text>
                <Code block color="gray" sx={{ fontSize: 11 }}>
                  {`{
  "id": 1,
  "title": "Manga Name",
  "source": "asuratoon",
  "genres": ["Action"],
  "readingStatus": {
    "totalChapters": 1,
    "readChapters": 0,
    "unreadChapters": 1,
    "percentageComplete": 0,
    "isFullyRead": false
  },
  "chapters": [
    {
      "id": 42,
      "index": 0,
      "fileName": "Chapter 0.cbz",
      "isRead": false,
      "lastReadAt": null
    }
  ]
}`}
                </Code>
              </Stack>

              <Divider opacity={0.1} />

              <Stack spacing="md">
                <Group spacing="xs" sx={{ flexWrap: 'wrap' }}>
                  <Badge color="orange" size="lg" radius="sm">
                    PATCH
                  </Badge>
                  <Code sx={{ fontSize: 14, fontWeight: 700 }}>/api/v1/mangas/{'{id}'}</Code>
                  <Text size="sm" color="dimmed">
                    - Actualizar estado de lectura del manga o capítulos específicos
                  </Text>
                </Group>

                <Box sx={{ overflowX: 'auto' }}>
                  <Table verticalSpacing="xs" fontSize="xs" highlightOnHover>
                    <thead>
                      <tr>
                        <th>Parámetro</th>
                        <th>Tipo</th>
                        <th>Ubicación</th>
                        <th>Requerido</th>
                        <th>Descripción</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          <Code>id</Code>
                        </td>
                        <td>
                          <Text size="xs" color="dimmed">
                            integer
                          </Text>
                        </td>
                        <td>Path</td>
                        <td>Sí</td>
                        <td>Identificador único del manga</td>
                      </tr>
                      <tr>
                        <td>
                          <Code>Authorization</Code>
                        </td>
                        <td>
                          <Text size="xs" color="dimmed">
                            string
                          </Text>
                        </td>
                        <td>Header</td>
                        <td>Sí</td>
                        <td>
                          Formato: <Code>Bearer &lt;API_TOKEN&gt;</Code>
                        </td>
                      </tr>
                    </tbody>
                  </Table>
                </Box>

                <Text size="xs" weight={600} mt="xs">
                  Cuerpo de Petición (Request Body) - Formato A (Marcar todo el manga):
                </Text>
                <Code block color="gray" sx={{ fontSize: 11 }}>
                  {`{
  "isRead": true
}`}
                </Code>

                <Text size="xs" weight={600} mt="xs">
                  Cuerpo de Petición (Request Body) - Formato B (Capítulos específicos):
                </Text>
                <Code block color="gray" sx={{ fontSize: 11 }}>
                  {`{
  "chapters": [
    { "id": 42, "isRead": true },
    { "id": 43, "isRead": false }
  ]
}`}
                </Code>

                <Text size="xs" weight={600} mt="xs">
                  Respuesta Exitosa (200 OK):
                </Text>
                <Code block color="gray" sx={{ fontSize: 11 }}>
                  {`{
  "success": true,
  "updatedChaptersCount": 2
}`}
                </Code>
              </Stack>

              <Divider opacity={0.1} />

              {/* Security and Tokens guide */}
              <Stack spacing="sm">
                <Group spacing="xs">
                  <IconKey size={20} style={{ color: '#eab308' }} />
                  <Title order={5}>Seguridad y Autenticación</Title>
                </Group>
                <Text size="xs" color="dimmed">
                  Todas las solicitudes a los endpoints de la API deben estar autenticadas mediante un Bearer Token.
                  Sigue estos pasos para interactuar con la API:
                </Text>
                <List size="xs" color="dimmed" spacing="xs">
                  <List.Item>
                    Ve a la pestaña <b>Cuentas</b> en el menú lateral de Kaizen.
                  </List.Item>
                  <List.Item>
                    Genera un nuevo <b>API Token</b> para el usuario correspondiente.
                  </List.Item>
                  <List.Item>
                    Copia el token e inclúyelo en la cabecera HTTP de tus peticiones:{' '}
                    <Code>Authorization: Bearer &lt;tu_token&gt;</Code>.
                  </List.Item>
                </List>
              </Stack>
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </>
  );
}

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common', 'settings'])),
    },
  };
}
