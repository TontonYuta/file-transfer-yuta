/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SenderDeviceInfo {
  id: string;
  name: string;
  type: 'mac' | 'iphone' | 'android' | 'windows' | 'linux' | 'browser';
  browser: string;
}

export interface SharedFileRecord {
  id: string; // e.g. "AD-8492"
  name: string;
  size: number;
  type: string; // MIME type
  extension: string;
  blob?: Blob;
  blobUrl?: string; // transient memory blob URL
  uploadedAt: number;
  expiresAt: number;
  expirationMinutes: number;
  downloadCount: number;
  maxDownloads?: number;
  pinCode?: string; // Optional security PIN
  notes?: string;
  sha256?: string;
  sender: SenderDeviceInfo;
}

export interface PeerDevice {
  id: string;
  sessionId: string;
  name: string;
  type: 'mac' | 'iphone' | 'android' | 'windows' | 'linux' | 'tablet' | 'browser';
  browser: string;
  lastSeen: number;
  isSelf?: boolean;
}

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type?: 'success' | 'info' | 'warning' | 'error';
  duration?: number;
}

export interface LanInterface {
  name: string;
  ip: string;
  url: string;
}

export interface ServerConfig {
  appUrl: string;
  activePort: number;
  lanIp: string;
  lanUrl: string;
  lanInterfaces: LanInterface[];
  maxFileSize: number;
  status: string;
}

