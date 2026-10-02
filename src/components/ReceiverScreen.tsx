/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  File,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  Archive,
  Code,
  Clock,
  ShieldCheck,
  Lock,
  Play,
  Pause,
  Maximize2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Laptop,
  Smartphone,
  Sparkles,
  ArrowRight,
  Hash,
} from 'lucide-react';
import { SharedFileRecord, SenderDeviceInfo } from '../types/share';
import { formatBytes, getFileCategory, getCategoryBadgeColor, formatDurationRemaining } from '../utils/formatters';
import { storageService } from '../services/storageService';
import { playDownloadStart, playChimeSuccess, playBlip } from '../utils/audio';
import confetti from 'canvas-confetti';

interface ReceiverScreenProps {
  initialShareId?: string;
  onShowToast: (title: string, description?: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  onNavigateToSend: () => void;
}

export const ReceiverScreen: React.FC<ReceiverScreenProps> = ({
  initialShareId,
  onShowToast,
  onNavigateToSend,
}) => {
  const [inputCode, setInputCode] = useState(initialShareId || '');
  const [currentShare, setCurrentShare] = useState<SharedFileRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // Security PIN
  const [pinInput, setPinInput] = useState('');
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [pinError, setPinError] = useState(false);

  // Expiration countdown
  const [timeLeftMs, setTimeLeftMs] = useState<number>(0);
  const [isExpired, setIsExpired] = useState(false);

  // Media preview states
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [textPreviewContent, setTextPreviewContent] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Load initial share if provided
  useEffect(() => {
    if (initialShareId) {
      loadShare(initialShareId);
    }
  }, [initialShareId]);

  // Live timer tick
  useEffect(() => {
    if (!currentShare) return;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, currentShare.expiresAt - now);
      setTimeLeftMs(remaining);

      if (remaining <= 0) {
        setIsExpired(true);
      } else {
        setIsExpired(false);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [currentShare]);

  const loadShare = async (id: string) => {
    if (!id.trim()) return;
    setIsLoading(true);
    setNotFound(false);
    setPinUnlocked(false);
    setPinError(false);
    setDownloadSuccess(false);

    try {
      const record = await storageService.getShare(id);
      if (record) {
        setCurrentShare(record);
        if (!record.pinCode) {
          setPinUnlocked(true);
        }

        // Load text/code preview if markdown/text
        if (record.type.includes('text') || record.type.includes('json') || record.extension === 'md') {
          try {
            if (record.blob) {
              const text = await record.blob.text();
              setTextPreviewContent(text.slice(0, 5000));
            } else {
              const text = await storageService.getTextPreview(record.id);
              setTextPreviewContent(text);
            }
          } catch {
            setTextPreviewContent(null);
          }
        }

        playBlip();
      } else {
        setNotFound(true);
        setCurrentShare(null);
      }
    } catch {
      setNotFound(true);
      setCurrentShare(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputCode.trim()) {
      loadShare(inputCode.trim());
    }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentShare) return;
    const cleanPin = pinInput.trim();
    const isValid = await storageService.verifyPin(currentShare.id, cleanPin);
    if (isValid) {
      setPinUnlocked(true);
      setPinError(false);

      // If preview is server-backed, attach pin to blobUrl so media elements can load it!
      if (currentShare.blobUrl && !currentShare.blobUrl.startsWith('blob:')) {
        const previewUrl = `/api/shares/${currentShare.id}/preview?pin=${encodeURIComponent(cleanPin)}`;
        setCurrentShare((prev) => (prev ? { ...prev, blobUrl: previewUrl } : null));
      }

      // Fetch text preview with pin if applicable
      if (currentShare.type.includes('text') || currentShare.type.includes('json') || currentShare.extension === 'md') {
        storageService.getTextPreview(currentShare.id, cleanPin).then((text) => {
          if (text) setTextPreviewContent(text);
        });
      }

      playChimeSuccess();
      onShowToast('PIN Verified', 'Access to file granted.', 'success');
    } else {
      setPinError(true);
      onShowToast('Incorrect PIN', 'Please check the 4-digit security code.', 'error');
    }
  };

  const handleDownload = async () => {
    if (!currentShare) return;

    setIsDownloading(true);
    playDownloadStart();

    // Trigger instant browser download from server endpoint or local blob
    try {
      const downloadUrl = storageService.getDownloadUrl(currentShare.id, pinInput || undefined);
      const a = document.createElement('a');
      a.href = currentShare.blobUrl?.startsWith('blob:') ? currentShare.blobUrl : downloadUrl;
      a.download = currentShare.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setDownloadSuccess(true);
      setIsDownloading(false);
      playChimeSuccess();

      try {
        confetti({
          particleCount: 70,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#10b981', '#f59e0b', '#38bdf8'],
        });
      } catch {
        // ignore
      }

      onShowToast('Download Complete!', `${currentShare.name} saved to your device.`, 'success');
    } catch (err) {
      setIsDownloading(false);
      onShowToast('Download Error', 'Could not save file to disk.', 'error');
    }
  };

  // Audio Player Controls
  const togglePlayAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  const handleAudioTimeUpdate = () => {
    if (!audioRef.current) return;
    const current = audioRef.current.currentTime;
    const duration = audioRef.current.duration || 1;
    setAudioCurrentTime(current);
    setAudioDuration(duration);
    setAudioProgress((current / duration) * 100);
  };

  const handleAudioSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const seekTo = (parseFloat(e.target.value) / 100) * (audioRef.current.duration || 1);
    audioRef.current.currentTime = seekTo;
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

  const fileCategory = currentShare ? getFileCategory(currentShare.type, currentShare.name) : 'other';
  const timeInfo = formatDurationRemaining(timeLeftMs);
  const totalTtlMs = currentShare ? currentShare.expirationMinutes * 60 * 1000 : 1;
  const percentRemaining = Math.max(0, Math.min(100, (timeLeftMs / totalTtlMs) * 100));

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      
      {/* Screen Title & Manual Lookup Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-zinc-800/80">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">
            Receive File
          </h1>
          <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
            <span>Instant Peer Retrieval</span>
            <span aria-hidden="true">·</span>
            <span>Safe In-Browser Preview</span>
            <span aria-hidden="true">·</span>
            <span>Zero Quality Loss</span>
          </div>
        </div>

        {/* Enter Code / URL search bar */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              placeholder="Enter Code (e.g. AD-8492)"
              className="pl-8 pr-3 py-1.5 text-xs font-mono tracking-wider bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-400 w-48 sm:w-56"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !inputCode.trim()}
            className="px-3.5 py-1.5 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Find'}
          </button>
        </form>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
          <p className="text-sm font-semibold text-zinc-300">Locating shared file package...</p>
          <p className="text-xs text-zinc-500">Decrypting package metadata from local peer mesh</p>
        </div>
      )}

      {/* Not Found State */}
      {!isLoading && notFound && (
        <div className="p-8 sm:p-12 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-center space-y-4 max-w-md mx-auto animate-in fade-in">
          <div className="p-3.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 w-fit mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-zinc-100">Share Link Not Found or Expired</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              The requested code <span className="font-mono text-amber-300">{inputCode}</span> may have expired, was revoked by the sender, or was entered on a different device without sync.
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateToSend}
            className="px-4 py-2 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl transition-colors cursor-pointer"
          >
            Send a new file instead
          </button>
        </div>
      )}

      {/* Empty State when no code loaded yet */}
      {!isLoading && !currentShare && !notFound && (
        <div className="p-12 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 text-center space-y-4 max-w-md mx-auto">
          <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 w-fit mx-auto text-amber-400">
            <Download className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-zinc-200">Waiting for Share Link</h3>
            <p className="text-xs text-zinc-500">
              Scan a QR code from another device or enter a 6-character share code in the box above to preview and download.
            </p>
          </div>
        </div>
      )}

      {/* ACTIVE LOADED SHARE */}
      {!isLoading && currentShare && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Expiration Banner / Live Timer */}
          <div
            className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isExpired
                ? 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                : timeLeftMs < 120000
                ? 'bg-amber-950/30 border-amber-500/40 text-amber-300'
                : 'bg-zinc-900/90 border-zinc-800 text-zinc-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-xl ${
                  isExpired ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
                }`}
              >
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-semibold block">
                  {isExpired ? 'Link Expired' : 'Transfer Expiration'}
                </span>
                <span className="text-[11px] text-zinc-400">
                  {isExpired
                    ? 'This file has reached its time-to-live and is no longer downloadable.'
                    : `Self-destructs when countdown reaches zero.`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-auto">
              {/* Progress bar */}
              {!isExpired && (
                <div className="w-24 sm:w-32 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-1000"
                    style={{ width: `${percentRemaining}%` }}
                  />
                </div>
              )}
              <span className="font-mono text-sm font-bold tabular-nums px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800">
                {timeInfo.text}
              </span>
            </div>
          </div>

          {/* PIN Lock Screen if required and locked */}
          {!pinUnlocked && currentShare.pinCode ? (
            <div className="p-8 sm:p-10 rounded-2xl bg-zinc-900 border border-amber-500/30 max-w-md mx-auto text-center space-y-4">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 w-fit mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-zinc-100">PIN Protection Required</h3>
                <p className="text-xs text-zinc-400">The sender protected this file with a 4-digit code.</p>
              </div>

              <form onSubmit={handleVerifyPin} className="space-y-3">
                <input
                  type="password"
                  maxLength={6}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Enter PIN Code"
                  className={`w-full px-4 py-2.5 text-center text-lg font-mono tracking-widest bg-zinc-950 border rounded-xl text-zinc-100 focus:outline-none ${
                    pinError ? 'border-rose-500 text-rose-300' : 'border-zinc-700 focus:border-amber-400'
                  }`}
                  autoFocus
                />
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Unlock & Access File
                </button>
              </form>
            </div>
          ) : (
            /* UNLOCKED FILE CARD & PREVIEW GRID */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Main Column: File Preview (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                
                {/* Media Preview Box */}
                <div className="p-4 sm:p-6 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4 overflow-hidden">
                  
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
                    <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      Safe Preview
                    </span>
                    <span className="text-[11px] text-zinc-500 uppercase font-mono">
                      {currentShare.extension || 'FILE'}
                    </span>
                  </div>

                  {/* Image Preview */}
                  {fileCategory === 'image' && currentShare.blobUrl && (
                    <div className="relative rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800/80 flex items-center justify-center max-h-[380px] group">
                      <img
                        src={currentShare.blobUrl}
                        alt={currentShare.name}
                        referrerPolicy="no-referrer"
                        className="max-h-[360px] w-auto max-w-full object-contain rounded-lg transition-transform duration-200 group-hover:scale-[1.01]"
                      />
                    </div>
                  )}

                  {/* Audio Preview with waveform visualizer */}
                  {fileCategory === 'audio' && currentShare.blobUrl && (
                    <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-4">
                      <audio
                        ref={audioRef}
                        src={currentShare.blobUrl}
                        onTimeUpdate={handleAudioTimeUpdate}
                        onEnded={() => setIsPlayingAudio(false)}
                        className="hidden"
                      />

                      {/* Visualizer bars */}
                      <div className="flex items-center justify-center gap-1.5 h-16 px-4">
                        {[40, 65, 85, 30, 95, 50, 75, 45, 90, 60, 35, 80, 55, 70, 40].map((h, i) => (
                          <div
                            key={i}
                            className={`w-1.5 rounded-full transition-all duration-150 ${
                              isPlayingAudio ? 'bg-amber-400 animate-pulse' : 'bg-zinc-700'
                            }`}
                            style={{
                              height: isPlayingAudio ? `${Math.max(15, (h * (audioProgress % 20 + 10)) / 20)}%` : `${h * 0.4}%`,
                            }}
                          />
                        ))}
                      </div>

                      {/* Custom Audio Player Controls */}
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={togglePlayAudio}
                          className="p-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold transition-all cursor-pointer shadow-md"
                        >
                          {isPlayingAudio ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                        </button>

                        <div className="flex-1 space-y-1">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={audioProgress}
                            onChange={handleAudioSeek}
                            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                          />
                          <div className="flex justify-between text-[11px] font-mono text-zinc-500">
                            <span>{Math.floor(audioCurrentTime)}s</span>
                            <span>{Math.floor(audioDuration || 0)}s</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Video Preview */}
                  {fileCategory === 'video' && currentShare.blobUrl && (
                    <div className="rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800">
                      <video
                        ref={videoRef}
                        src={currentShare.blobUrl}
                        controls
                        className="w-full max-h-[340px] rounded-lg"
                      />
                    </div>
                  )}

                  {/* Code / Markdown / Text Preview */}
                  {fileCategory === 'code' && textPreviewContent && (
                    <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-4 max-h-[300px] overflow-y-auto">
                      <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed">
                        {textPreviewContent}
                      </pre>
                    </div>
                  )}

                  {/* Generic File Placeholder */}
                  {fileCategory !== 'image' && fileCategory !== 'audio' && fileCategory !== 'video' && !textPreviewContent && (
                    <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 bg-zinc-950/60 rounded-xl border border-zinc-800/60">
                      <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
                        {getFileCategoryIcon(currentShare.type, currentShare.name)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-zinc-200">{currentShare.name}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">Ready for safe direct download</p>
                      </div>
                    </div>
                  )}

                  {/* Optional Note from Sender */}
                  {currentShare.notes && (
                    <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/70 text-xs">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-0.5">
                        Sender Note
                      </span>
                      <p className="text-zinc-300">{currentShare.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: File Details & Download Action (5 cols) */}
              <div className="lg:col-span-5 space-y-4">
                
                <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-5">
                  
                  {/* File Metadata Header */}
                  <div className="flex items-start gap-3.5">
                    <div className="p-3.5 rounded-xl bg-zinc-800 border border-zinc-700 shrink-0">
                      {getFileCategoryIcon(currentShare.type, currentShare.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-bold text-zinc-100 truncate">{currentShare.name}</h3>
                      <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
                        <span className="font-mono tabular-nums">{formatBytes(currentShare.size)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="uppercase text-[10px] font-bold text-zinc-300">
                          {currentShare.extension || 'FILE'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Sender Device Marker */}
                  <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">Sent From</span>
                      <span className="font-medium text-zinc-200 flex items-center gap-1.5">
                        {currentShare.sender?.type === 'iphone' || currentShare.sender?.type === 'android' ? (
                          <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <Laptop className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                        {currentShare.sender?.name || 'Peer Device'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">Integrity Check</span>
                      <span className="font-mono text-[11px] text-emerald-400 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Verified SHA-256
                      </span>
                    </div>

                    {currentShare.sha256 && (
                      <div className="text-[10px] font-mono text-zinc-500 truncate pt-1 border-t border-zinc-900">
                        {currentShare.sha256}
                      </div>
                    )}
                  </div>

                  {/* Prominent Primary Download Button */}
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={isExpired || isDownloading}
                      onClick={handleDownload}
                      className={`w-full py-4 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xl ${
                        isExpired
                          ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700'
                          : downloadSuccess
                          ? 'bg-emerald-500 text-zinc-950 shadow-emerald-500/20'
                          : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 shadow-emerald-500/25 active:scale-[0.99]'
                      }`}
                    >
                      {downloadSuccess ? (
                        <>
                          <CheckCircle2 className="w-5 h-5" />
                          Downloaded Successfully
                        </>
                      ) : (
                        <>
                          <Download className="w-5 h-5" />
                          Download File ({formatBytes(currentShare.size)})
                        </>
                      )}
                    </button>

                    {downloadSuccess && (
                      <p className="text-center text-[11px] text-emerald-400 font-medium">
                        File saved to browser downloads folder.
                      </p>
                    )}
                  </div>

                  {/* Send a reply file quick link */}
                  <div className="pt-2 border-t border-zinc-800">
                    <button
                      type="button"
                      onClick={() => {
                        playBlip();
                        onNavigateToSend();
                      }}
                      className="w-full py-2.5 text-xs font-semibold text-zinc-400 hover:text-amber-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>Send a reply file back</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                </div>

              </div>

            </div>
          )}

        </div>
      )}

    </div>
  );
};
