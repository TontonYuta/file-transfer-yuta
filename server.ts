/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import os from 'os';
import net from 'net';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const DEFAULT_PORT = parseInt(process.env.PORT || '3000', 10);
let activePort = DEFAULT_PORT;

export interface LanInterface {
  name: string;
  ip: string;
  url: string;
}

// Find non-internal IPv4 addresses for LAN sharing
export function getLanInterfaces(port: number): LanInterface[] {
  const interfaces = os.networkInterfaces();
  const list: LanInterface[] = [];
  for (const [name, netList] of Object.entries(interfaces)) {
    if (!netList) continue;
    for (const item of netList) {
      const isIPv4 = item.family === 'IPv4' || (item.family as unknown) === 4;
      if (isIPv4 && !item.internal) {
        list.push({
          name,
          ip: item.address,
          url: `http://${item.address}:${port}`,
        });
      }
    }
  }

  // Sort list to prioritize private networks (192.168.x.x, 10.x.x.x, 172.x.x.x)
  list.sort((a, b) => {
    const isAPrivate = a.ip.startsWith('192.168.') || a.ip.startsWith('10.');
    const isBPrivate = b.ip.startsWith('192.168.') || b.ip.startsWith('10.');
    if (isAPrivate && !isBPrivate) return -1;
    if (!isAPrivate && isBPrivate) return 1;
    return 0;
  });

  return list;
}

// Find an available port if DEFAULT_PORT is in use
export function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve) => {
    const testServer = net.createServer();
    testServer.listen(startPort, '0.0.0.0', () => {
      const address = testServer.address();
      const port = typeof address === 'object' && address ? address.port : startPort;
      testServer.close(() => resolve(port));
    });
    testServer.on('error', () => {
      // Port in use, check next port
      resolve(findAvailablePort(startPort + 1));
    });
  });
}

// Global CORS & Security Headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (_req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Configure JSON and URL-encoded parsers with large body limit
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Use Memory Storage for blazing fast, zero-disk-dependency reliability
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB max
  },
});

export interface StoredFileRecord {
  id: string;
  name: string;
  size: number;
  type: string;
  extension: string;
  buffer: Buffer;
  uploadedAt: number;
  expiresAt: number;
  expirationMinutes: number;
  downloadCount: number;
  pinCode?: string;
  notes?: string;
  sha256: string;
  sender: {
    name: string;
    type: string;
    browser: string;
  };
}

// In-memory file storage
const sharesMap = new Map<string, StoredFileRecord>();

// Generate short 6-char share ID
function generateShortId(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = 'AD-';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Periodic TTL cleaner (removes expired files every 30s)
setInterval(() => {
  const now = Date.now();
  sharesMap.forEach((record, id) => {
    if (record.expiresAt && now > record.expiresAt) {
      sharesMap.delete(id);
    }
  });
}, 30000);

// API: Get server configuration & public share base URL
app.get('/api/config', (req: Request, res: Response) => {
  const lanInterfaces = getLanInterfaces(activePort);
  const primaryLan = lanInterfaces[0] || null;
  const lanUrl = primaryLan ? primaryLan.url : '';
  const lanIp = primaryLan ? primaryLan.ip : '';

  let appUrl = process.env.APP_URL || '';
  
  if (!appUrl) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${activePort}`;
    appUrl = `${proto}://${host}`;
  }

  if (appUrl.includes('ais-dev-')) {
    appUrl = appUrl.replace('ais-dev-', 'ais-pre-');
  }

  res.json({
    appUrl,
    activePort,
    lanIp,
    lanUrl,
    lanInterfaces,
    maxFileSize: 100 * 1024 * 1024,
    status: 'ok',
  });
});

// API: Upload a file
app.post('/api/upload', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No file uploaded or file empty' });
    }

    const {
      expirationMinutes: rawExp,
      pinCode,
      notes,
      senderName,
      senderType,
      senderBrowser,
    } = req.body;

    const expirationMinutes = parseInt(rawExp || '15', 10);
    const now = Date.now();
    const expiresAt = now + expirationMinutes * 60 * 1000;
    const shareId = generateShortId();

    // Calculate real SHA-256 hash
    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const extension = req.file.originalname.split('.').pop()?.toLowerCase() || '';

    const record: StoredFileRecord = {
      id: shareId,
      name: req.file.originalname,
      size: req.file.size,
      type: req.file.mimetype || 'application/octet-stream',
      extension,
      buffer: req.file.buffer,
      uploadedAt: now,
      expiresAt,
      expirationMinutes,
      downloadCount: 0,
      pinCode: pinCode ? String(pinCode).trim() : undefined,
      notes: notes ? String(notes).trim() : undefined,
      sha256,
      sender: {
        name: senderName || 'Peer Device',
        type: senderType || 'browser',
        browser: senderBrowser || 'Browser',
      },
    };

    sharesMap.set(shareId, record);

    return res.status(201).json({
      id: record.id,
      name: record.name,
      size: record.size,
      type: record.type,
      extension: record.extension,
      uploadedAt: record.uploadedAt,
      expiresAt: record.expiresAt,
      expirationMinutes: record.expirationMinutes,
      downloadCount: record.downloadCount,
      pinRequired: Boolean(record.pinCode),
      notes: record.notes,
      sha256: record.sha256,
      sender: record.sender,
    });
  } catch (error: unknown) {
    console.error('Upload processing error:', error);
    const msg = error instanceof Error ? error.message : 'Upload processing failed';
    return res.status(500).json({ error: msg });
  }
});

// API: Get share metadata by ID
app.get('/api/shares/:id', (req: Request, res: Response) => {
  const shareId = (req.params.id || '').toUpperCase().trim();
  const record = sharesMap.get(shareId);

  if (!record) {
    return res.status(404).json({ error: 'Share link not found or expired' });
  }

  const now = Date.now();
  if (record.expiresAt && now > record.expiresAt) {
    sharesMap.delete(shareId);
    return res.status(410).json({ error: 'This file share has expired' });
  }

  res.json({
    id: record.id,
    name: record.name,
    size: record.size,
    type: record.type,
    extension: record.extension,
    uploadedAt: record.uploadedAt,
    expiresAt: record.expiresAt,
    expirationMinutes: record.expirationMinutes,
    downloadCount: record.downloadCount,
    pinRequired: Boolean(record.pinCode),
    notes: record.notes,
    sha256: record.sha256,
    sender: record.sender,
  });
});

// API: Verify PIN code
app.post('/api/shares/:id/verify-pin', (req: Request, res: Response) => {
  const shareId = (req.params.id || '').toUpperCase().trim();
  const { pin } = req.body;
  const record = sharesMap.get(shareId);

  if (!record) {
    return res.status(404).json({ error: 'Share link not found' });
  }

  if (!record.pinCode) {
    return res.json({ valid: true });
  }

  if (record.pinCode === String(pin).trim()) {
    return res.json({ valid: true });
  }

  return res.status(401).json({ valid: false, error: 'Incorrect PIN code' });
});

// API: Download the actual file
app.get('/api/shares/:id/download', (req: Request, res: Response) => {
  const shareId = (req.params.id || '').toUpperCase().trim();
  const pin = req.query.pin ? String(req.query.pin).trim() : undefined;
  const record = sharesMap.get(shareId);

  if (!record) {
    return res.status(404).json({ error: 'File not found or expired' });
  }

  const now = Date.now();
  if (record.expiresAt && now > record.expiresAt) {
    sharesMap.delete(shareId);
    return res.status(410).json({ error: 'File has expired' });
  }

  if (record.pinCode && record.pinCode !== pin) {
    return res.status(401).json({ error: 'Valid PIN required to download this file' });
  }

  record.downloadCount += 1;

  const safeFilename = encodeURIComponent(record.name);
  res.setHeader('Content-Type', record.type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);
  res.setHeader('Content-Length', record.size);

  res.end(record.buffer);
});

// API: Stream inline preview for safe viewing (images, videos, audio)
app.get('/api/shares/:id/preview', (req: Request, res: Response) => {
  const shareId = (req.params.id || '').toUpperCase().trim();
  const pin = req.query.pin ? String(req.query.pin).trim() : undefined;
  const record = sharesMap.get(shareId);

  if (!record) {
    return res.status(404).json({ error: 'File not found or expired' });
  }

  if (record.pinCode && record.pinCode !== pin) {
    return res.status(401).json({ error: 'PIN verification required' });
  }

  const safeFilename = encodeURIComponent(record.name);
  res.setHeader('Content-Type', record.type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);

  res.end(record.buffer);
});

// API: Stream text / code for reader preview
app.get('/api/shares/:id/text', (req: Request, res: Response) => {
  const shareId = (req.params.id || '').toUpperCase().trim();
  const pin = req.query.pin ? String(req.query.pin).trim() : undefined;
  const record = sharesMap.get(shareId);

  if (!record) {
    return res.status(404).json({ error: 'File not found' });
  }

  if (record.pinCode && record.pinCode !== pin) {
    return res.status(401).json({ error: 'PIN verification required' });
  }

  try {
    const text = record.buffer.toString('utf-8');
    res.json({ content: text.slice(0, 50000) });
  } catch {
    res.status(500).json({ error: 'Could not read text content' });
  }
});

// API: Delete / Revoke a share
app.delete('/api/shares/:id', (req: Request, res: Response) => {
  const shareId = (req.params.id || '').toUpperCase().trim();
  sharesMap.delete(shareId);
  res.json({ success: true });
});

// Multer & General Error Handling Middleware
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Multer upload error: ${err.message}` });
  } else if (err) {
    const msg = err instanceof Error ? err.message : 'Unknown server error';
    return res.status(500).json({ error: msg });
  }
  next();
});

// Start dev Vite middleware or serve static production dist
async function startServer() {
  // Find available port to prevent EADDRINUSE crash
  activePort = await findAvailablePort(activePort);

  const isProd = process.env.NODE_ENV === 'production';
  const distPath = fs.existsSync(path.resolve(__dirname, 'index.html'))
    ? __dirname
    : path.resolve(__dirname, 'dist');

  if (isProd && fs.existsSync(path.resolve(distPath, 'index.html'))) {
    app.use(express.static(distPath));
    app.use('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api')) {
        return next();
      }
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: unknown) {
        if (typeof (vite as unknown as { ssrFixStacktrace?: (err: unknown) => void }).ssrFixStacktrace === 'function') {
          (vite as unknown as { ssrFixStacktrace: (err: unknown) => void }).ssrFixStacktrace(e);
        }
        next(e);
      }
    });
  }

  app.listen(activePort, '0.0.0.0', () => {
    const lanList = getLanInterfaces(activePort);
    console.log(`\n======================================================`);
    console.log(`🚀 AirDrop Web is running!`);
    console.log(`💻 Local URL:        http://localhost:${activePort}`);
    if (lanList.length > 0) {
      console.log(`📱 LAN / Wi-Fi URL:   ${lanList[0].url}`);
      console.log(`   (Open this URL on your phone/tablet on same Wi-Fi)`);
    }
    console.log(`======================================================\n`);
  });
}

startServer();

