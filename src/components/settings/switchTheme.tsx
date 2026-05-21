import { Box, Center, SegmentedControl, useMantineColorScheme, Group, Text, Stack } from '@mantine/core';
import { useColorScheme } from '@mantine/hooks';
import { IconMoon, IconPalette, IconSun, IconBrush } from '@tabler/icons-react';
import { getCookie, setCookie } from 'cookies-next';
import { useEffect, useState } from 'react';
import { useAppTheme } from '../../theme/ThemeContext';

export function SwitchTheme() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const preferredColorScheme = useColorScheme();
  const [value, setValue] = useState<string>('auto');
  const { appTheme, setAppTheme } = useAppTheme();

  useEffect(() => {
    const followSystem = getCookie('follow-system') === '1';
    if (followSystem) {
      setValue('auto');
    } else {
      setValue(colorScheme);
    }
  }, [colorScheme]);

  return (
    <Stack spacing="lg">
      <Box>
        <Text size="sm" weight={500} mb={8}>
          Modo de Color
        </Text>
        <SegmentedControl
          sx={{ display: 'flex' }}
          size="sm"
          value={value}
          onChange={(val: 'light' | 'dark' | 'auto') => {
            setValue(val);
            setCookie('follow-system', val === 'auto' ? '1' : '0');
            toggleColorScheme(val === 'auto' ? preferredColorScheme : val);
          }}
          data={[
            {
              value: 'auto',
              label: (
                <Center>
                  <IconPalette size={16} strokeWidth={1.5} />
                  <Box ml={10}>Auto</Box>
                </Center>
              ),
            },
            {
              value: 'light',
              label: (
                <Center>
                  <IconSun size={16} strokeWidth={1.5} />
                  <Box ml={10}>Light</Box>
                </Center>
              ),
            },
            {
              value: 'dark',
              label: (
                <Center>
                  <IconMoon size={16} strokeWidth={1.5} />
                  <Box ml={10}>Dark</Box>
                </Center>
              ),
            },
          ]}
        />
      </Box>

      <Box>
        <Text size="sm" weight={500} mb={8}>
          Tema de la Aplicación
        </Text>
        <SegmentedControl
          sx={{ display: 'flex' }}
          size="sm"
          value={appTheme}
          onChange={(val: 'default' | 'kaizen') => {
            setAppTheme(val);
          }}
          data={[
            {
              value: 'default',
              label: (
                <Center>
                  <IconBrush size={16} strokeWidth={1.5} />
                  <Box ml={10}>Por Defecto</Box>
                </Center>
              ),
            },
            {
              value: 'kaizen',
              label: (
                <Center>
                  <IconPalette size={16} strokeWidth={1.5} />
                  <Box ml={10}>Kaizen</Box>
                </Center>
              ),
            },
          ]}
        />
      </Box>
    </Stack>
  );
}
