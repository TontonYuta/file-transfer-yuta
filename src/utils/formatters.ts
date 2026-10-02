/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatDurationRemaining(ms: number): {
  text: string;
  isExpired: boolean;
  minutes: number;
  seconds: number;
  percentRemaining: number;
} {
  if (ms <= 0) {
    return {
      text: 'Expired',
      isExpired: true,
      minutes: 0,
      seconds: 0,
      percentRemaining: 0,
    };
  }

  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;

  let text = '';
  if (m > 0) {
    text = `${m}m ${s.toString().padStart(2, '0')}s`;
  } else {
    text = `${s}s`;
  }

  return {
    text,
    isExpired: false,
    minutes: m,
    seconds: s,
    percentRemaining: 100, // will be computed against total TTL
  };
}

export type FileCategory = 'image' | 'video' | 'audio' | 'pdf' | 'code' | 'archive' | 'document' | 'other';

export function getFileCategory(mimeType: string, filename = ''): FileCategory {
  const type = mimeType.toLowerCase();
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'avif'].includes(ext)) {
    return 'image';
  }
  if (type.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) {
    return 'video';
  }
  if (type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) {
    return 'audio';
  }
  if (type === 'application/pdf' || ext === 'pdf') {
    return 'pdf';
  }
  if (
    type.includes('json') ||
    type.includes('javascript') ||
    type.includes('typescript') ||
    type.includes('html') ||
    type.includes('xml') ||
    type.includes('css') ||
    type.includes('text/') ||
    ['ts', 'tsx', 'js', 'jsx', 'json', 'md', 'html', 'css', 'py', 'rs', 'go', 'java', 'cpp', 'c', 'sql', 'sh', 'txt', 'yml', 'yaml'].includes(ext)
  ) {
    return 'code';
  }
  if (
    type.includes('zip') ||
    type.includes('tar') ||
    type.includes('rar') ||
    type.includes('7z') ||
    ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)
  ) {
    return 'archive';
  }
  if (
    type.includes('msword') ||
    type.includes('wordprocessingml') ||
    type.includes('spreadsheet') ||
    type.includes('presentation') ||
    ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)
  ) {
    return 'document';
  }

  return 'other';
}

export function getCategoryBadgeColor(category: FileCategory): {
  bg: string;
  text: string;
  border: string;
} {
  switch (category) {
    case 'image':
      return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' };
    case 'audio':
      return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' };
    case 'video':
      return { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' };
    case 'pdf':
      return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' };
    case 'code':
      return { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/20' };
    case 'archive':
      return { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' };
    case 'document':
      return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' };
    default:
      return { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/20' };
  }
}
