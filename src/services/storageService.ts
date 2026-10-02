/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SharedFileRecord, SenderDeviceInfo, PeerDevice, ServerConfig } from '../types/share';

const DB_NAME = 'AirDropWebDB';
const DB_VERSION = 2;
const STORE_NAME = 'shared_files';

export const CURRENT_SESSION_ID = 'sess-' + Math.random().toString(36).substring(2, 10);

// In-memory cache for immediate fast access
const memoryCache = new Map<string, SharedFileRecord>();

// Broadcast channel for multi-tab live sync & local peer discovery
let broadcastChannel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel('airdrop_web_mesh_v1');
  }
} catch {
  // fallback
}

// Cached server configuration and public base app URL
let cachedServerConfig: ServerConfig | null = null;
let cachedPublicAppUrl: string | null = null;

// Fetch and cache server configuration (including LAN IP and port)
export async function getServerConfig(): Promise<ServerConfig | null> {
  if (cachedServerConfig) return cachedServerConfig;
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const data: ServerConfig = await res.json();
      cachedServerConfig = data;
      return data;
    }
  } catch (err) {
    console.warn('Failed to fetch /api/config:', err);
  }
  return null;
}

// Initialize IndexedDB
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Generate short 6-character unique Share ID
export function generateShareId(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = 'AD-';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Calculate real SHA-256 hex string from blob
export async function calculateSHA256(blob: Blob): Promise<string> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return 'sha256-' + Math.random().toString(36).substring(2, 10);
  }
}

// Get the Public URL for QR Codes and sharing (prioritizes LAN URL for cross-device mobile sharing)
export async function getPublicAppUrl(preferLan = true): Promise<string> {
  const config = await getServerConfig();
  if (config) {
    const isLocalhost = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (preferLan && isLocalhost && config.lanUrl) {
      return config.lanUrl.replace(/\/$/, '');
    }

    if (config.appUrl) {
      let url = config.appUrl as string;
      if (url.includes('ais-dev-')) {
        url = url.replace('ais-dev-', 'ais-pre-');
      }
      return url.replace(/\/$/, '');
    }
  }

  if (typeof window !== 'undefined') {
    let origin = window.location.origin;
    if (origin.includes('ais-dev-')) {
      origin = origin.replace('ais-dev-', 'ais-pre-');
    }
    const pathname = window.location.pathname.replace(/\/$/, '');
    return `${origin}${pathname}`;
  }

  return '';
}

// Synchronous helper for immediate render (with LAN fallback if cached)
export function getDirectShareUrl(shareId: string, preferLan = true): string {
  if (typeof window === 'undefined') return '';

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (preferLan && isLocalhost && cachedServerConfig?.lanUrl) {
    return `${cachedServerConfig.lanUrl}/?share=${shareId}`;
  }

  let origin = window.location.origin;
  if (origin.includes('ais-dev-')) {
    origin = origin.replace('ais-dev-', 'ais-pre-');
  }
  const pathname = window.location.pathname;
  return `${origin}${pathname}?share=${shareId}`;
}

// Detect current device info
export function getLocalDeviceInfo(): SenderDeviceInfo {
  if (typeof window === 'undefined') {
    return { id: 'dev-unknown', name: 'Web Client', type: 'browser', browser: 'Browser' };
  }

  const savedName = localStorage.getItem('airdrop_device_name');
  let type: SenderDeviceInfo['type'] = 'browser';
  let browser = 'Browser';

  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipod/.test(ua)) {
    type = 'iphone';
  } else if (/ipad/.test(ua)) {
    type = 'mac';
  } else if (/android/.test(ua)) {
    type = 'android';
  } else if (/macintosh|mac os x/.test(ua)) {
    type = 'mac';
  } else if (/windows/.test(ua)) {
    type = 'windows';
  } else if (/linux/.test(ua)) {
    type = 'linux';
  }

  if (ua.includes('chrome') && !ua.includes('edg')) {
    browser = 'Chrome';
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browser = 'Safari';
  } else if (ua.includes('firefox')) {
    browser = 'Firefox';
  } else if (ua.includes('edg')) {
    browser = 'Edge';
  }

  const defaultName =
    type === 'mac'
      ? 'MacBook'
      : type === 'iphone'
      ? 'iPhone'
      : type === 'android'
      ? 'Android Device'
      : type === 'windows'
      ? 'Windows PC'
      : 'Web Device';

  return {
    id: CURRENT_SESSION_ID,
    name: savedName || defaultName,
    type,
    browser,
  };
}

export function saveCustomDeviceName(name: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('airdrop_device_name', name.trim());
  }
}

// Start live mesh discovery heartbeat across tabs/sessions
if (typeof window !== 'undefined') {
  const broadcastHeartbeat = () => {
    if (!broadcastChannel) return;
    const info = getLocalDeviceInfo();
    broadcastChannel.postMessage({
      type: 'PEER_HEARTBEAT',
      sessionId: CURRENT_SESSION_ID,
      name: info.name,
      deviceType: info.type,
      browser: info.browser,
      timestamp: Date.now(),
    });
  };

  setInterval(broadcastHeartbeat, 2500);
  setTimeout(broadcastHeartbeat, 100);

  window.addEventListener('beforeunload', () => {
    if (broadcastChannel) {
      broadcastChannel.postMessage({
        type: 'PEER_LEAVE',
        sessionId: CURRENT_SESSION_ID,
      });
    }
  });
}

export const storageService = {
  /**
   * Upload real file to backend API with automatic fallback to IndexedDB
   */
  async uploadFile(
    file: File,
    expirationMinutes: number,
    pinCode?: string,
    notes?: string,
    sender?: SenderDeviceInfo
  ): Promise<SharedFileRecord> {
    const sha256 = await calculateSHA256(file);
    const shareId = generateShareId();
    const now = Date.now();
    const expiresAt = now + expirationMinutes * 60 * 1000;
    const extension = file.name.split('.').pop()?.toLowerCase() || '';

    let record: SharedFileRecord = {
      id: shareId,
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      extension,
      blob: file,
      blobUrl: URL.createObjectURL(file),
      uploadedAt: now,
      expiresAt,
      expirationMinutes,
      downloadCount: 0,
      pinCode: pinCode || undefined,
      notes: notes || undefined,
      sha256,
      sender: sender || getLocalDeviceInfo(),
    };

    // Attempt backend server upload
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('expirationMinutes', String(expirationMinutes));
      if (pinCode) formData.append('pinCode', pinCode);
      if (notes) formData.append('notes', notes);
      if (sender) {
        formData.append('senderName', sender.name);
        formData.append('senderType', sender.type);
        formData.append('senderBrowser', sender.browser);
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        record.id = data.id || record.id;
        record.uploadedAt = data.uploadedAt || record.uploadedAt;
        record.expiresAt = data.expiresAt || record.expiresAt;
      }
    } catch (err) {
      console.warn('Backend upload skipped, using direct browser storage:', err);
    }

    // Cache in memory and IndexedDB
    memoryCache.set(record.id.toUpperCase(), record);

    try {
      const db = await openDB();
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put(record);
    } catch {
      // ignore
    }

    if (broadcastChannel) {
      broadcastChannel.postMessage({
        type: 'FILE_UPLOADED',
        shareId: record.id,
        senderSessionId: CURRENT_SESSION_ID,
      });
    }

    return record;
  },

  /**
   * Retrieve a shared file metadata by ID from backend API or local cache
   */
  async getShare(id: string): Promise<SharedFileRecord | null> {
    const cleanId = id.trim().toUpperCase();

    // Check memory cache first
    let record: SharedFileRecord | null | undefined = memoryCache.get(cleanId);

    // Try fetching from backend API (enables true cross-device download across phone & laptop!)
    try {
      const res = await fetch(`/api/shares/${cleanId}`);
      if (res.ok) {
        const data = await res.json();
        const serverRecord: SharedFileRecord = {
          id: data.id,
          name: data.name,
          size: data.size,
          type: data.type,
          extension: data.extension,
          blobUrl: `/api/shares/${cleanId}/preview`,
          uploadedAt: data.uploadedAt,
          expiresAt: data.expiresAt,
          expirationMinutes: data.expirationMinutes,
          downloadCount: data.downloadCount || 0,
          pinCode: data.pinRequired ? 'REQUIRED' : undefined,
          notes: data.notes,
          sha256: data.sha256,
          sender: data.sender || { name: 'Sender Device', type: 'browser', browser: 'Browser' },
        };
        memoryCache.set(cleanId, serverRecord);
        return serverRecord;
      }
    } catch (err) {
      console.warn('Backend fetch failed, falling back to local store:', err);
    }

    if (!record) {
      try {
        const db = await openDB();
        record = await new Promise<SharedFileRecord | null>((resolve) => {
          const transaction = db.transaction([STORE_NAME], 'readonly');
          const store = transaction.objectStore(STORE_NAME);
          const req = store.get(cleanId);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        });

        if (record && record.blob && !record.blobUrl) {
          record.blobUrl = URL.createObjectURL(record.blob);
          memoryCache.set(cleanId, record);
        }
      } catch (err) {
        console.warn('IndexedDB read error:', err);
      }
    }

    if (!record) return null;

    const now = Date.now();
    if (record.expiresAt && now > record.expiresAt) {
      return null;
    }

    return record;
  },

  /**
   * Verify PIN with server
   */
  async verifyPin(shareId: string, pin: string): Promise<boolean> {
    const cleanId = shareId.trim().toUpperCase();
    try {
      const res = await fetch(`/api/shares/${cleanId}/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.valid === true;
      }
      return false;
    } catch {
      const local = memoryCache.get(cleanId);
      return local?.pinCode === pin;
    }
  },

  /**
   * Download the file directly from backend or local blob
   */
  getDownloadUrl(shareId: string, pin?: string): string {
    const cleanId = shareId.trim().toUpperCase();
    if (pin) {
      return `/api/shares/${cleanId}/download?pin=${encodeURIComponent(pin)}`;
    }
    return `/api/shares/${cleanId}/download`;
  },

  /**
   * Fetch code/markdown text for preview
   */
  async getTextPreview(shareId: string, pin?: string): Promise<string | null> {
    const cleanId = shareId.trim().toUpperCase();
    try {
      const query = pin ? `?pin=${encodeURIComponent(pin)}` : '';
      const res = await fetch(`/api/shares/${cleanId}/text${query}`);
      if (res.ok) {
        const data = await res.json();
        return data.content || null;
      }
    } catch {
      // ignore
    }
    return null;
  },

  /**
   * List recent local shares
   */
  async listRecentShares(): Promise<SharedFileRecord[]> {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const list: SharedFileRecord[] = req.result || [];
          list.sort((a, b) => b.uploadedAt - a.uploadedAt);
          resolve(list);
        };
        req.onerror = () => resolve(Array.from(memoryCache.values()));
      });
    } catch {
      return Array.from(memoryCache.values());
    }
  },

  /**
   * Revoke / Delete a share
   */
  async deleteShare(id: string): Promise<boolean> {
    const cleanId = id.trim().toUpperCase();
    memoryCache.delete(cleanId);
    try {
      await fetch(`/api/shares/${cleanId}`, { method: 'DELETE' });
    } catch {
      // ignore
    }
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const req = store.delete(cleanId);
        req.onsuccess = () => {
          if (broadcastChannel) {
            broadcastChannel.postMessage({ type: 'FILE_REVOKED', shareId: cleanId });
          }
          resolve(true);
        };
        req.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  },

  /**
   * Listen to cross-tab broadcast events & peer discovery
   */
  onEvent(callback: (event: { type: string; [key: string]: unknown }) => void): () => void {
    if (!broadcastChannel) return () => {};
    const handler = (e: MessageEvent) => {
      callback(e.data);
    };
    broadcastChannel.addEventListener('message', handler);
    return () => {
      broadcastChannel?.removeEventListener('message', handler);
    };
  },

  /**
   * Announce presence immediately
   */
  pingMesh() {
    if (!broadcastChannel) return;
    const info = getLocalDeviceInfo();
    broadcastChannel.postMessage({
      type: 'PEER_HEARTBEAT',
      sessionId: CURRENT_SESSION_ID,
      name: info.name,
      deviceType: info.type,
      browser: info.browser,
      timestamp: Date.now(),
    });
  },

  /**
   * Get server network configuration
   */
  getServerConfig,
};
