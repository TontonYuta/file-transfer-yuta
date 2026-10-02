/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  Archive,
  Code,
  File,
  Trash2,
  Download,
  Share2,
  Clock,
  ExternalLink,
  Eye,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { SharedFileRecord } from '../types/share';
import { formatBytes, getFileCategory, formatDurationRemaining } from '../utils/formatters';
import { storageService } from '../services/storageService';
import { playBlip, playDownloadStart } from '../utils/audio';

interface HistoryScreenProps {
  onSelectShare: (share: SharedFileRecord) => void;
  onNavigateToReceive: (shareId: string) => void;
  onShowToast: (title: string, description?: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const HistoryScreen: React.FC<HistoryScreenProps> = ({
  onSelectShare,
  onNavigateToReceive,
  onShowToast,
}) => {
  const [shares, setShares] = useState<SharedFileRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const list = await storageService.listRecentShares();
      setShares(list);
    } catch {
      setShares([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    playBlip();
    await storageService.deleteShare(id);
    setShares((prev) => prev.filter((s) => s.id !== id));
    onShowToast('Transfer Revoked', 'File link has been purged.', 'info');
  };

  const handleDownload = (record: SharedFileRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!record.blobUrl) return;
    playDownloadStart();
    const a = document.createElement('a');
    a.href = record.blobUrl;
    a.download = record.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onShowToast('Download Started', record.name, 'success');
  };

  const getFileCategoryIcon = (mime: string, name: string) => {
    const cat = getFileCategory(mime, name);
    switch (cat) {
      case 'image':
        return <ImageIcon className="w-5 h-5 text-emerald-400" />;
      case 'video':
        return <Video className="w-5 h-5 text-rose-400" />;
      case 'audio':
        return <Music className="w-5 h-5 text-amber-400" />;
      case 'pdf':
        return <FileText className="w-5 h-5 text-red-400" />;
      case 'code':
        return <Code className="w-5 h-5 text-sky-400" />;
      case 'archive':
        return <Archive className="w-5 h-5 text-purple-400" />;
      default:
        return <File className="w-5 h-5 text-zinc-300" />;
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-800/80">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">
            Transfer History
          </h1>
          <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
            <span>Local IndexedDB Persistence</span>
            <span aria-hidden="true">·</span>
            <span>{shares.length} records</span>
          </div>
        </div>

        <button
          onClick={loadHistory}
          className="px-3 py-1.5 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
          <RefreshCw className="w-6 h-6 text-amber-400 animate-spin" />
          <p className="text-xs text-zinc-400">Loading transfers...</p>
        </div>
      ) : shares.length === 0 ? (
        <div className="p-12 rounded-2xl bg-zinc-900/40 border border-zinc-800 text-center space-y-3">
          <Clock className="w-8 h-8 text-zinc-600 mx-auto" />
          <h3 className="text-base font-bold text-zinc-200">No Transfers Yet</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Files you send will be stored here during their active expiration window for quick re-sharing or downloads.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shares.map((item) => {
            const now = Date.now();
            const remainingMs = item.expiresAt - now;
            const isExpired = remainingMs <= 0;
            const timeInfo = formatDurationRemaining(remainingMs);

            return (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <div className="p-3 rounded-xl bg-zinc-800 border border-zinc-700 shrink-0">
                    {getFileCategoryIcon(item.type, item.name)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-zinc-100 truncate">{item.name}</h4>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 mt-0.5">
                      <span className="font-mono font-bold text-amber-400">{item.id}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{formatBytes(item.size)}</span>
                      <span aria-hidden="true">·</span>
                      <span className={isExpired ? 'text-rose-400' : 'text-emerald-400'}>
                        {isExpired ? 'Expired' : `${timeInfo.text} left`}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{item.downloadCount} dl</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      playBlip();
                      onNavigateToReceive(item.id);
                    }}
                    className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Open Receiver View"
                  >
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="hidden sm:inline">Preview</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleDownload(item, e)}
                    className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Download to disk"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleDelete(item.id, e)}
                    className="p-2 rounded-lg bg-zinc-800 hover:bg-rose-950 hover:text-rose-400 text-zinc-400 text-xs font-medium transition-colors cursor-pointer"
                    title="Revoke / Delete share"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
