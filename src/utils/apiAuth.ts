import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../server/db/client';

export async function validateApiToken(req: NextApiRequest, res: NextApiResponse): Promise<boolean> {
  const authHeader = req.headers.authorization;
  const sessionCookie = req.cookies['kaizen-session'];
  const queryToken = (req.query?.token as string) || (req.query?.apiKey as string) || (req.query?.apiToken as string);

  const settings = await prisma.settings.findFirst();
  const authEnabled = settings?.authEnabled === true;

  // 1. If authentication is disabled globally, allow all web/browser requests
  if (!authEnabled) {
    return true;
  }

  // 2. If session cookie is present, validate it
  if (sessionCookie) {
    try {
      let decoded = sessionCookie;
      if (decoded.includes('%')) {
        decoded = decodeURIComponent(decoded);
      }
      if (decoded.startsWith('"') && decoded.endsWith('"')) {
        decoded = decoded.substring(1, decoded.length - 1);
      }
      const userObj = JSON.parse(decoded);
      let user = null;
      if (userObj.id) {
        user = await prisma.user.findUnique({ where: { id: userObj.id } });
      } else if (userObj.username) {
        user = await prisma.user.findUnique({ where: { username: userObj.username } });
      }

      if (user && user.username === userObj.username) {
        const roleNormalized = (r?: string) => (r || '').toUpperCase();
        const userRole = roleNormalized(user.role);
        const cookieRole = roleNormalized(userObj.role);
        if (
          userRole === cookieRole ||
          (userRole === 'SUPERADMIN' && (cookieRole === 'ADMIN' || cookieRole === 'SUPERADMIN'))
        ) {
          return true;
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to parse session cookie:', e);
      // Fallback to Bearer Token
    }
  }

  // 3. Extract token from Authorization header OR query parameter
  let token: string | null = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (queryToken) {
    token = queryToken.trim();
  }

  if (!token) {
    if (!res.headersSent) {
      res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }
    return false;
  }

  const userAgent = (req.headers['user-agent'] as string) || null;
  const method = req.method || 'GET';
  const path = req.url || '/';

  try {
    if (!settings || !settings.apiEnabled) {
      if (!res.headersSent) {
        res.status(403).json({ error: 'Forbidden: API is disabled' });
      }
      return false;
    }

    const user = await prisma.user.findUnique({
      where: { apiToken: token },
    });

    if (user) {
      // Update tracking fields and write audit log asynchronously (fire-and-forget)
      prisma.user
        .update({
          where: { id: user.id },
          data: {
            lastActiveAt: new Date(),
            lastUserAgent: userAgent,
            apiCallCount: { increment: 1 },
          },
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Failed to update user activity:', err);
        });

      prisma.apiCallLog
        .create({
          data: {
            userId: user.id,
            method,
            path,
            userAgent,
          },
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Failed to write API call log:', err);
        });

      return true;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Error validating API token:', e);
  }

  if (!res.headersSent) {
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
  return false;
}
