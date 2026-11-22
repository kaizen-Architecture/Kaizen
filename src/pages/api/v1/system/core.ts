import { NextApiRequest, NextApiResponse } from 'next';
import {
  checkCoreVersionAndCompatibility,
  getCoreDiagnostics,
  getMangalConfig,
  rollbackKaizenMangalCore,
  setMangalConfig,
  updateKaizenMangalCore,
} from '../../../../server/utils/mangal';
import { validateApiToken } from '../../../../utils/apiAuth';

/**
 * REST v1 endpoint for remote Kaizen Core (`kaizen-mangal`) diagnostics, settings,
 * compatibility checks, autonomous in-place updates, and rollback (used by Kaizen iOS App).
 * - GET  /api/v1/system/core -> diagnostics + versionCheck + active kaizen-mangal settings
 * - POST /api/v1/system/core
 *     { action: "check" }
 *     { action: "update", force?: boolean }
 *     { action: "rollback" }
 *     { action: "setConfig", key: string, value: string | number | boolean }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const isValid = await validateApiToken(req, res);
  if (!isValid) return;

  try {
    if (req.method === 'GET') {
      const [diagnostics, config] = await Promise.all([
        getCoreDiagnostics(),
        getMangalConfig('kaizen-mangal'),
      ]);
      return res.status(200).json({
        diagnostics,
        config: config.sort((a, b) => a.key.localeCompare(b.key)),
      });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const action = String(body.action || 'check');

      if (action === 'check') {
        const result = await checkCoreVersionAndCompatibility(true);
        return res.status(200).json(result);
      }

      if (action === 'update') {
        const result = await updateKaizenMangalCore(Boolean(body.force));
        return res.status(200).json(result);
      }

      if (action === 'rollback') {
        const result = await rollbackKaizenMangalCore();
        return res.status(200).json(result);
      }

      if (action === 'setConfig') {
        const key = String(body.key || '').trim();
        if (!key) {
          return res.status(400).json({ error: 'key is required' });
        }
        const config = await getMangalConfig('kaizen-mangal');
        if (!config.find((c) => c.key === key)) {
          return res.status(400).json({ error: `Invalid Kaizen Core config key: ${key}` });
        }
        await setMangalConfig(key, body.value, 'kaizen-mangal');
        return res.status(200).json({ success: true, key, value: body.value });
      }

      return res.status(400).json({ error: `Unsupported action: ${action}` });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
}
