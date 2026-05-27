import { AppShell } from '@mantine/core';
import { useState } from 'react';
import { ReaderNavbar } from './ReaderNavbar';
import { ReaderHeader } from './ReaderHeader';

interface ReaderLayoutProps {
  children: React.ReactNode;
}

export function ReaderLayout({ children }: ReaderLayoutProps) {
  const [navOpened, setNavOpened] = useState(false);

  return (
    <AppShell
      fixed
      padding="md"
      navbar={<ReaderNavbar opened={navOpened} setOpened={setNavOpened} />}
      header={<ReaderHeader opened={navOpened} setOpened={setNavOpened} />}
      styles={(theme) => ({
        main: { backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0] },
      })}
    >
      {children}
    </AppShell>
  );
}
