import {
  Box,
  Burger,
  Container,
  createStyles,
  Group,
  Header,
  MediaQuery,
  Title,
  UnstyledButton,
  useMantineTheme,
} from '@mantine/core';
import Image from 'next/image';
import Link from 'next/link';
import { SearchControl } from '../headerSearch';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SettingsMenuButton } from '../settingsMenu';
import { useAppTheme } from '../../theme/ThemeContext';

const useStyles = createStyles(
  (
    theme,
    {
      headerBgLight,
      headerBgDark,
      headerTextColor,
    }: {
      headerBgLight: string;
      headerBgDark: string;
      headerTextColor: string;
    },
  ) => ({
    header: {
      backgroundColor: theme.colorScheme === 'dark' ? headerBgDark : headerBgLight,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: theme.colorScheme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
      boxShadow: theme.colorScheme === 'dark' ? '0 1px 20px rgba(0,0,0,0.3)' : '0 1px 20px rgba(0,0,0,0.05)',
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
      color: headerTextColor,
    },
  }),
);

interface ReaderHeaderProps {
  opened: boolean;
  setOpened: (opened: boolean) => void;
}

export function ReaderHeader({ opened, setOpened }: ReaderHeaderProps) {
  const { currentThemeConfig } = useAppTheme();
  const theme = useMantineTheme();
  const headerTextColor =
    theme.colorScheme === 'dark'
      ? currentThemeConfig.colors.headerText.dark
      : currentThemeConfig.colors.headerText.light;
  const { classes } = useStyles({
    headerBgLight: currentThemeConfig.colors.headerBg.light,
    headerBgDark: currentThemeConfig.colors.headerBg.dark,
    headerTextColor,
  });

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
                color={
                  theme.colorScheme === 'dark'
                    ? currentThemeConfig.colors.burgerColor.dark
                    : currentThemeConfig.colors.burgerColor.light
                }
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
