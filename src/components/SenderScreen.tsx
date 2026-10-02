/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, DragEvent, ChangeEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  UploadCloud,
  File,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  Archive,
  Code,
  Copy,
  Check,
  Clock,
  Lock,
  Download,
  Share2,
  ShieldCheck,
  ArrowRight,
  Eye,
  RefreshCw,
  Wifi,
  Globe,
  Laptop,
  Smartphone,
} from 'lucide-react';
import { SharedFileRecord, SenderDeviceInfo, ServerConfig } from '../types/share';
import { formatBytes, getFileCategory } from '../utils/formatters';
import { storageService, generateShareId, calculateSHA256 } from '../services/storageService';
import { playChimeSuccess, playBlip } from '../utils/audio';
import confetti from 'canvas-confetti';

interface SenderScreenProps {
  deviceInfo: SenderDeviceInfo;
  onShareCreated: (record: SharedFileRecord) => void;
  onShowToast: (title: string, description?: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  onNavigateToReceive: (shareId: string) => void;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export const SenderScreen: React.FC<SenderScreenProps> = ({
  deviceInfo,
  onShareCreated,
  onShowToast,
  onNavigateToReceive,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customFileName, setCustomFileName] = useState('');
  const [expirationMinutes, setExpirationMinutes] = useState<number>(15);
  const [pinCode, setPinCode] = useState('');
  const [enablePin, setEnablePin] = useState(false);
  const [notes, setNotes] = useState('');

  // Uploading state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState('0 MB/s');

  // Server LAN Config & Mode
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [shareUrlMode, setShareUrlMode] = useState<'lan' | 'local'>('lan');

  // Active Share Result
  const [activeShare, setActiveShare] = useState<SharedFileRecord | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [qrInverted, setQrInverted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<SVGSVGElement>(null);

  // Fetch server LAN configuration on mount
  useEffect(() => {
    storageService.getServerConfig().then((cfg) => {
      if (cfg) {
        setServerConfig(cfg);
        if (cfg.lanUrl) {
          setShareUrlMode('lan');
        }
      }
    });
  }, []);

  // Real-time listener for file downloads across sessions/tabs
  useEffect(() => {
    const unsubscribe = storageService.onEvent((event) => {
      if (activeShare && event.type === 'FILE_DOWNLOADED' && event.shareId === activeShare.id) {
        setActiveShare((prev) => (prev ? { ...prev, downloadCount: (prev.downloadCount || 0) + 1 } : null));
        onShowToast('File Downloaded!', 'A connected receiver just retrieved this file.', 'success');
        playChimeSuccess();
      }
    });
    return () => unsubscribe();
  }, [activeShare, onShowToast]);

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      onShowToast('File Too Large', `Maximum allowed size is 100MB (Selected file is ${formatBytes(file.size)})`, 'error');
      return;
    }
    setSelectedFile(file);
    setCustomFileName(file.name);
    playBlip();
  };

  const handleStartUpload = async () => {
    if (!selectedFile) return;
    const name = customFileName.trim() || selectedFile.name;
    const size = selectedFile.size;
    const type = selectedFile.type || 'application/octet-stream';
    const ext = name.split('.').pop() || '';

    setIsUploading(true);
    setUploadProgress(0);

    const startTime = Date.now();

    // Track simulated transfer tick while uploading to server
    const progressTimer = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) return prev;
        const next = prev + Math.floor(Math.random() * 15) + 5;
        const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
        const speedMb = ((size * (next / 100)) / (1024 * 1024) / elapsedSec).toFixed(1);
        setUploadSpeed(`${speedMb} MB/s`);
        return Math.min(90, next);
      });
    }, 150);

    try {
      const saved = await storageService.uploadFile(
        selectedFile,
        expirationMinutes,
        enablePin && pinCode ? pinCode.trim() : undefined,
        notes.trim() || undefined,
        deviceInfo
      );

      clearInterval(progressTimer);
      setUploadProgress(100);
      setActiveShare(saved);
      setIsUploading(false);
      onShareCreated(saved);
      playChimeSuccess();

      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#f59e0b', '#10b981', '#ffffff'],
        });
      } catch {
        // ignore
      }

      onShowToast('File Ready to Share!', `Share code: ${saved.id} (Expires in ${expirationMinutes}m)`, 'success');
    } catch (err: unknown) {
      clearInterval(progressTimer);
      setIsUploading(false);
      const msg = err instanceof Error ? err.message : 'Upload failed';
      onShowToast('Upload Error', msg, 'error');
    }
  };

  const getShareUrl = () => {
    if (!activeShare) return '';

    // If LAN mode is active and we have a valid LAN URL, use it (best for mobile scanning!)
    if (shareUrlMode === 'lan' && serverConfig?.lanUrl) {
      return `${serverConfig.lanUrl}/?share=${activeShare.id}`;
    }

    if (typeof window === 'undefined') return '';
    let origin = window.location.origin;
    if (origin.includes('ais-dev-')) {
      origin = origin.replace('ais-dev-', 'ais-pre-');
    }
    const pathname = window.location.pathname;
    return `${origin}${pathname}?share=${activeShare.id}`;
  };

  const handleCopyLanBase = async () => {
    if (!serverConfig?.lanUrl) return;
    try {
      await navigator.clipboard.writeText(serverConfig.lanUrl);
      playBlip();
      onShowToast('Đã sao chép địa chỉ LAN', `Mở ${serverConfig.lanUrl} trên điện thoại cùng Wi-Fi`, 'success');
    } catch {
      onShowToast('Lỗi sao chép', 'Vui lòng sao chép thủ công.', 'error');
    }
  };

  const handleCopyLink = async () => {
    const url = getShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      playBlip();
      onShowToast('Link Copied!', 'Direct download link copied to clipboard.', 'success');
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      onShowToast('Copy Failed', 'Please copy manually.', 'error');
    }
  };

  const handleCopyCode = async () => {
    if (!activeShare) return;
    try {
      await navigator.clipboard.writeText(activeShare.id);
      setCopiedCode(true);
      playBlip();
      onShowToast('Share Code Copied!', `Code ${activeShare.id} copied.`, 'success');
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleDownloadQR = () => {
    if (!qrRef.current) return;
    const svgElement = qrRef.current;
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      if (ctx) {
        ctx.fillStyle = qrInverted ? '#09090b' : '#ffffff';
        ctx.fillRect(0, 0, 600, 600);
        ctx.drawImage(img, 50, 50, 500, 500);
        const a = document.createElement('a');
        a.download = `AirDrop-QR-${activeShare?.id}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
        playBlip();
        onShowToast('QR Code Saved', 'High-res QR image downloaded.', 'success');
      }
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleReset = () => {
    setSelectedFile(null);
    setCustomFileName('');
    setActiveShare(null);
    setIsUploading(false);
    setUploadProgress(0);
    setPinCode('');
    setEnablePin(false);
    setNotes('');
    playBlip();
  };

  const getFileCategoryIcon = (mime: string, name: string) => {
    const cat = getFileCategory(mime, name);
    switch (cat) {
      case 'image':
        return <ImageIcon className="w-8 h-8 text-emerald-400" />;
      case 'video':
        return <Video className="w-8 h-8 text-rose-400" />;
      case 'audio':
        return <Music className="w-8 h-8 text-amber-400" />;
      case 'pdf':
        return <FileText className="w-8 h-8 text-red-400" />;
      case 'code':
        return <Code className="w-8 h-8 text-sky-400" />;
      case 'archive':
        return <Archive className="w-8 h-8 text-purple-400" />;
      default:
        return <File className="w-8 h-8 text-zinc-300" />;
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      
      {/* Screen Title & Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-800/80">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">
            Send File
          </h1>
          <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
            <span>Direct Encrypted Transfer</span>
            <span aria-hidden="true">·</span>
            <span>Max 100 MB</span>
            <span aria-hidden="true">·</span>
            <span>Instant Cross-Device QR</span>
          </div>
        </div>

        {serverConfig?.lanUrl && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
            <Wifi className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-zinc-300">Wi-Fi LAN:</span>
            <span className="font-mono font-semibold text-amber-300">{serverConfig.lanIp}:{serverConfig.activePort}</span>
            <button
              type="button"
              onClick={handleCopyLanBase}
              className="px-2 py-0.5 ml-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-[11px] font-medium text-amber-200 transition-colors cursor-pointer"
              title="Copy LAN address"
            >
              Copy
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {!activeShare ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Dropzone & File Details (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            
            {/* Drag & Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => !isUploading && fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center p-8 sm:p-12 rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer overflow-hidden ${
                dragActive
                  ? 'border-amber-400 bg-amber-500/10 scale-[1.01]'
                  : selectedFile
                  ? 'border-emerald-500/50 bg-emerald-950/10'
                  : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
                disabled={isUploading}
              />

              {/* Glowing decorative backdrop */}
              <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

              {selectedFile ? (
                <div className="flex flex-col items-center text-center space-y-3 z-10">
                  <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-700/80 shadow-lg">
                    {getFileCategoryIcon(selectedFile.type, selectedFile.name)}
                  </div>
                  <div className="max-w-xs sm:max-w-sm truncate">
                    <p className="text-base font-semibold text-zinc-100 truncate">{selectedFile.name}</p>
                    <div className="flex items-center justify-center gap-2 text-xs text-zinc-400 mt-1">
                      <span className="font-mono tabular-nums">{formatBytes(selectedFile.size)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="uppercase text-[10px] font-bold tracking-wider text-zinc-300">
                        {selectedFile.name.split('.').pop() || 'FILE'}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-amber-400 hover:underline">Click or drop another file to replace</span>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center space-y-3 z-10">
                  <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-zinc-400 shadow-inner group-hover:text-amber-400 transition-colors">
                    <UploadCloud className="w-8 h-8 text-amber-400/90" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-zinc-200">
                      Drop any real file here or <span className="text-amber-400 underline">browse</span>
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">Photos, videos, audio, documents, archives up to 100MB</p>
                  </div>
                </div>
              )}
            </div>

            {/* Upload Progress Bar (when uploading) */}
            {isUploading && (
              <div className="p-5 rounded-2xl bg-zinc-900/90 border border-amber-500/30 space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-amber-300 flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Encrypting and staging for peer delivery...
                  </span>
                  <span className="font-mono tabular-nums font-bold text-zinc-200">{uploadProgress}%</span>
                </div>

                <div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 rounded-full transition-all duration-150"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                  <span>Speed: {uploadSpeed}</span>
                  <span>{formatBytes((selectedFile?.size || 0) * (uploadProgress / 100))} / {formatBytes(selectedFile?.size || 0)}</span>
                </div>
              </div>
            )}

            {/* Security Notice */}
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/60 text-xs text-zinc-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                Files are stored ephemerally in browser-backed storage and purged automatically when the countdown expires.
              </span>
            </div>
          </div>

          {/* Right Column: Expiration & Transfer Options (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-5 rounded-2xl bg-zinc-900/70 border border-zinc-800 space-y-5">
              
              {/* Expiration Timer Selector */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  Auto-Expiration Timer
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: '5 Mins', value: 5 },
                    { label: '15 Mins', value: 15 },
                    { label: '1 Hour', value: 60 },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setExpirationMinutes(option.value);
                        playBlip();
                      }}
                      className={`py-2 px-2.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer text-center ${
                        expirationMinutes === option.value
                          ? 'bg-amber-500/15 border-amber-400/80 text-amber-300 shadow-sm'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Security PIN */}
              <div className="pt-4 border-t border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 cursor-pointer">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    Security PIN (Optional)
                  </label>
                  <input
                    type="checkbox"
                    id="enablePin"
                    checked={enablePin}
                    onChange={(e) => {
                      setEnablePin(e.target.checked);
                      playBlip();
                    }}
                    className="w-4 h-4 rounded bg-zinc-950 border-zinc-700 text-amber-500 focus:ring-amber-400 cursor-pointer"
                  />
                </div>
                {enablePin && (
                  <div className="space-y-1.5 animate-in fade-in">
                    <input
                      type="text"
                      maxLength={6}
                      value={pinCode}
                      onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 8492"
                      className="w-full px-3.5 py-2 text-sm font-mono tracking-widest bg-zinc-950 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-400"
                    />
                    <p className="text-[11px] text-zinc-500">Receiver must enter this PIN code to download.</p>
                  </div>
                )}
              </div>

              {/* Optional Note / Message */}
              <div className="pt-4 border-t border-zinc-800">
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Attachment Note (Optional)
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Project files for review"
                  className="w-full px-3.5 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                />
              </div>

              {/* Primary Action Button */}
              <div className="pt-3">
                <button
                  type="button"
                  disabled={!selectedFile || isUploading}
                  onClick={handleStartUpload}
                  className={`w-full py-3.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                    selectedFile && !isUploading
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold shadow-amber-500/20 active:scale-[0.99]'
                      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  }`}
                >
                  <Share2 className="w-4 h-4" />
                  Generate Download Link & QR
                </button>
              </div>

            </div>
          </div>

        </div>
      ) : (
        /* SUCCESS / ACTIVE SHARE VIEW */
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Box: High Contrast QR Code Display (6 cols) */}
            <div className="lg:col-span-6 p-6 sm:p-8 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col items-center text-center space-y-5">
              
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-zinc-100">Scan with Camera or Phone</h3>
                <p className="text-xs text-zinc-400">Point any phone camera to open and receive instantly.</p>
              </div>

              {/* Network target selector (LAN Wi-Fi vs Localhost) */}
              {serverConfig?.lanUrl && (
                <div className="w-full flex items-center p-1 bg-zinc-950 rounded-xl border border-zinc-800 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setShareUrlMode('lan');
                      playBlip();
                    }}
                    className={`flex-1 py-1.5 px-2 rounded-lg font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      shareUrlMode === 'lan'
                        ? 'bg-amber-500 text-zinc-950 font-bold shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Wifi className="w-3.5 h-3.5" />
                    <span>Wi-Fi LAN ({serverConfig.lanIp})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShareUrlMode('local');
                      playBlip();
                    }}
                    className={`flex-1 py-1.5 px-2 rounded-lg font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      shareUrlMode === 'local'
                        ? 'bg-zinc-800 text-zinc-100 font-bold shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Laptop className="w-3.5 h-3.5" />
                    <span>Máy này (Local)</span>
                  </button>
                </div>
              )}

              {/* QR Code Container with High-Contrast Framing */}
              <div
                className={`p-4 rounded-2xl border-2 shadow-2xl transition-all ${
                  qrInverted
                    ? 'bg-zinc-950 border-amber-400/80 shadow-amber-950/30'
                    : 'bg-white border-white shadow-zinc-950/50'
                }`}
              >
                <QRCodeSVG
                  ref={qrRef}
                  value={getShareUrl()}
                  size={220}
                  level="H"
                  includeMargin={false}
                  bgColor={qrInverted ? '#09090b' : '#ffffff'}
                  fgColor={qrInverted ? '#f59e0b' : '#09090b'}
                />
              </div>

              {/* Context guidance for LAN transfer */}
              <div className="text-[11px] text-zinc-400 max-w-[280px]">
                {shareUrlMode === 'lan' && serverConfig?.lanIp ? (
                  <p className="text-amber-300 font-medium">
                    📶 Quét bằng điện thoại cùng mạng Wi-Fi ({serverConfig.lanIp}) để tải file ngay.
                  </p>
                ) : (
                  <p>Quét mã QR để mở trang nhận file trên trình duyệt.</p>
                )}
              </div>

              {/* QR Code Action Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadQR}
                  className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Save QR Image
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQrInverted(!qrInverted);
                    playBlip();
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors cursor-pointer"
                >
                  {qrInverted ? 'Light QR' : 'Dark QR'}
                </button>
              </div>

              {/* Unique Short Code */}
              <div className="w-full pt-4 border-t border-zinc-800 flex items-center justify-between px-3">
                <div className="text-left">
                  <span className="text-[10px] uppercase font-bold text-zinc-500">Quick 6-Char Code</span>
                  <p className="text-base font-mono font-bold text-amber-300">{activeShare.id}</p>
                </div>
                <button
                  onClick={handleCopyCode}
                  className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCode ? 'Copied' : 'Copy Code'}
                </button>
              </div>

            </div>

            {/* Right Box: Share Details, Direct URL & Receiver Test (6 cols) */}
            <div className="lg:col-span-6 space-y-4">
              
              {/* File Info Card */}
              <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                <div className="flex items-start gap-3.5">
                  <div className="p-3 rounded-xl bg-zinc-800 border border-zinc-700 shrink-0">
                    {getFileCategoryIcon(activeShare.type, activeShare.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-base font-bold text-zinc-100 truncate">{activeShare.name}</h4>
                    <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
                      <span className="font-mono tabular-nums">{formatBytes(activeShare.size)}</span>
                      <span aria-hidden="true">·</span>
                      <span>Expires in {activeShare.expirationMinutes} min</span>
                    </div>
                  </div>
                </div>

                {/* Direct Download Link Copy Box */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300">Direct Download Link</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={getShareUrl()}
                      className="flex-1 px-3.5 py-2.5 text-xs font-mono bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-300 truncate select-all focus:outline-none"
                    />
                    <button
                      onClick={handleCopyLink}
                      className={`px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                        copiedLink
                          ? 'bg-emerald-500 text-zinc-950 font-bold'
                          : 'bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold'
                      }`}
                    >
                      {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copiedLink ? 'Copied' : 'Copy Link'}
                    </button>
                  </div>
                </div>

                {/* Security PIN status */}
                {activeShare.pinCode && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
                    <span className="text-amber-300 font-medium flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      Protected by PIN
                    </span>
                    <span className="font-mono font-bold tracking-widest text-amber-200 bg-amber-500/20 px-2 py-0.5 rounded">
                      {activeShare.pinCode}
                    </span>
                  </div>
                )}

                {/* Live Download Counter */}
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Total Downloads Received</span>
                  <span className="font-mono font-bold text-emerald-400 tabular-nums">
                    {activeShare.downloadCount} {activeShare.downloadCount === 1 ? 'time' : 'times'}
                  </span>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800 space-y-3">
                <span className="text-xs font-semibold text-zinc-400">Next Steps</span>

                <button
                  type="button"
                  onClick={() => {
                    playBlip();
                    onNavigateToReceive(activeShare.id);
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-xs font-semibold text-zinc-100 flex items-center justify-between transition-all cursor-pointer group"
                >
                  <span className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-emerald-400" />
                    Open Receiver Preview Screen
                  </span>
                  <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full py-2.5 px-4 rounded-xl bg-transparent hover:bg-zinc-800/60 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  Send Another File
                </button>
              </div>

            </div>

          </div>

        </div>
      )}

    </div>
  );
};
