import { ActionIcon, Tooltip } from '@mantine/core';
import { useRouter } from 'next/router';
import { IconSettings } from '@tabler/icons-react';
import { useAppTheme } from '../theme/ThemeContext';

export function SettingsMenuButton() {
  const router = useRouter();
  const { currentThemeConfig } = useAppTheme();
  return (
    <Tooltip withinPortal withArrow label="Settings" position="bottom-end">
      <ActionIcon
        variant="subtle"
        aria-label="Open settings"
        sx={(theme) => ({
          color:
            theme.colorScheme === 'dark'
              ? currentThemeConfig.colors.headerText.dark
              : currentThemeConfig.colors.headerText.light,
          '&:hover': {
            backgroundColor: theme.colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
          },
        })}
        onClick={() => router.push('/settings')}
        size="lg"
      >
        <IconSettings size={20} strokeWidth={1.5} />
      </ActionIcon>
    </Tooltip>
  );
}
