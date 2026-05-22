import React, { useEffect, useState } from 'react';
import { getCookie } from 'cookies-next';
import { trpc } from '../../utils/trpc';
import { LoginScreen } from './LoginScreen';
import { useRouter } from 'next/router';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const settings = trpc.settings.query.useQuery();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsClient(true);
    const sessionCookie = getCookie('kaizen-session');
    if (sessionCookie) {
      setIsAuthenticated(true);

      try {
        const userObj = JSON.parse(sessionCookie as string);
        const allowedPaths = ['/reader/library', '/manga', '/reader', '/settings', '/404'];
        const isAllowed = allowedPaths.some(p => router.pathname.startsWith(p));
        if (userObj.role === 'READER' && !isAllowed) {
          router.replace('/reader/library');
        }
      } catch (e) {
        // ignore
      }
    }
  }, [router.pathname, router]);

  // Allow app to load cleanly if authEnabled is toggled off
  const authEnabled = (settings.data?.appConfig as any)?.authEnabled === true;

  if (!isClient || settings.isLoading) {
    // Avoid SSR hydration flickering during initial state mounting
    return <>{children}</>;
  }

  if (!authEnabled || isAuthenticated) {
    return <>{children}</>;
  }

  return <LoginScreen onLoginSuccess={() => setIsAuthenticated(true)} />;
}
