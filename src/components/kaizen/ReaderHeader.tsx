import {
  ActionIcon,
  Box,
  Burger,
  Container,
  createStyles,
  Group,
  Header,
  MediaQuery,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useState, useEffect } from 'react';
import { getCookie } from 'cookies-next';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { SearchControl } from '../headerSearch';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SettingsMenuButton } from '../settingsMenu';

const useStyles = createStyles((theme) => ({
  header: {
    backgroundColor: theme.colorScheme === 'dark' ? 'rgba(30, 27, 75, 0.85)' : 'rgba(67, 56, 202, 0.85)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 1px 20px rgba(0,0,0,0.3)',
  },
  inner: {
    height: '56px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    [`@media (max-width: ${theme.breakpoints.xs}px)`]: {
      display: 'none',
    },
    fontFamily: 'Inter, sans-serif',
    lineHeight: '1.2',
    fontWeight: 700,
    color: theme.colors.gray[0],
  },
}));

interface ReaderHeaderProps {
  opened: boolean;
  setOpened: (opened: boolean) => void;
}

export function ReaderHeader({ opened, setOpened }: ReaderHeaderProps) {
  const { classes } = useStyles();
  const router = useRouter();
  const { t } = useTranslation('common');

  const [currentUser, setCurrentUser] = useState<{ username: string; role: string } | null>(null);

  useEffect(() => {
    const session = getCookie('kaizen-session');
    if (session) {
      try {
        setCurrentUser(JSON.parse(session as string));
      } catch (e) {
        // ignore
      }
    }
  }, []);

  return (
    <Header height={56} className={classes.header}>
      <Container fluid>
        <Box className={classes.inner}>
          <Group spacing={8} noWrap sx={{ flexShrink: 0 }}>
            <MediaQuery largerThan="md" styles={{ display: 'none' }}>
              <Burger
                opened={opened}
                onClick={() => setOpened(!opened)}
                size="sm"
                color="white"
                aria-label="Toggle navigation"
              />
            </MediaQuery>

            <Link href="/reader/library">
              <UnstyledButton component="a">
                <Image alt="header" src="/kaizen.png" height={40} width={40} style={{ borderRadius: '8px' }} />
              </UnstyledButton>
            </Link>

            <Title order={3} className={classes.title}>
              Kaizen Reader
            </Title>
          </Group>

          <Group position="right" spacing={4} noWrap sx={{ flexShrink: 1, minWidth: 0 }}>
            <SearchControl />
            <MediaQuery smallerThan="md" styles={{ display: 'none' }}>
              <Group spacing={2} noWrap>
                {/* Reader-specific header actions can be added here later */}
              </Group>
            </MediaQuery>
            <LanguageSwitcher />
            <SettingsMenuButton />
          </Group>
        </Box>
      </Container>
    </Header>
  );
}
