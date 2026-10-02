/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { SenderScreen } from './components/SenderScreen';
import { ReceiverScreen } from './components/ReceiverScreen';
import { NearbyRadar } from './components/NearbyRadar';
import { HistoryScreen } from './components/HistoryScreen';
import { DeviceSettingsModal } from './components/DeviceSettingsModal';
import { ToastContainer } from './components/Toast';
import { SenderDeviceInfo, SharedFileRecord, ToastMessage, PeerDevice, ServerConfig } from './types/share';
import { getLocalDeviceInfo, storageService } from './services/storageService';
import { getSoundEnabled, setSoundEnabled } from './utils/audio';
import { Shield, Zap, Lock, QrCode } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'send' | 'receive' | 'radar' | 'history'>('send');
  const [deviceInfo, setDeviceInfo] = useState<SenderDeviceInfo>(getLocalDeviceInfo());
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [soundOn, setSoundOn] = useState<boolean>(getSoundEnabled());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [initialReceiveId, setInitialReceiveId] = useState<string>('');
  const [activeSharesCount, setActiveSharesCount] = useState<number>(0);

  useEffect(() => {
    storageService.getServerConfig().then((cfg) => {
      if (cfg) setServerConfig(cfg);
    });
  }, []);

  const showToast = useCallback((
    title: string,
    description?: string,
    type: 'success' | 'info' | 'warning' | 'error' = 'info'
  ) => {
    const id = 'toast-' + Math.random().toString(36).substring(2, 9);
    const newToast: ToastMessage = { id, title, description, type };
    setToasts((prev) => [...prev, newToast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Check URL parameters and hash for share links on initial load and route changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const parseRoute = () => {
      let shareId = '';

      // 1. Check query parameter ?share=AD-XXXX
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('share')) {
        shareId = urlParams.get('share')!;
      }

      // 2. Check hash #share=AD-XXXX or #AD-XXXX
      if (!shareId && window.location.hash) {
        const hash = window.location.hash.replace(/^#/, '');
        if (hash.startsWith('share=')) {
          shareId = hash.replace('share=', '');
        } else if (hash.startsWith('AD-') || hash.length >= 4) {
          shareId = hash;
        }
      }

      // 3. Check pathname /share/AD-XXXX or /s/AD-XXXX
      if (!shareId) {
        const match = window.location.pathname.match(/\/(?:share|s)\/([^/]+)/);
        if (match && match[1]) {
          shareId = match[1];
        }
      }

      if (shareId) {
        const clean = shareId.trim().toUpperCase();
        setInitialReceiveId(clean);
        setActiveTab('receive');
        showToast('Transfer Detected', `Loading package ${clean}`, 'info');
      }
    };

    parseRoute();
    window.addEventListener('hashchange', parseRoute);
    window.addEventListener('popstate', parseRoute);

    // Load active count
    updateActiveCount();

    return () => {
      window.removeEventListener('hashchange', parseRoute);
      window.removeEventListener('popstate', parseRoute);
    };
  }, [showToast]);

  const updateActiveCount = async () => {
    try {
      const list = await storageService.listRecentShares();
      const now = Date.now();
      const active = list.filter((s) => s.expiresAt > now);
      setActiveSharesCount(active.length);
    } catch {
      // ignore
    }
  };

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  };

  const handleShareCreated = (record: SharedFileRecord) => {
    updateActiveCount();
  };

  const handleNavigateToReceive = (shareId: string) => {
    setInitialReceiveId(shareId);
    setActiveTab('receive');
  };

  const handleSelectPeerFromRadar = (peer: PeerDevice) => {
    showToast('Peer Selected', `Ready to send file to ${peer.name}`, 'info');
    setActiveTab('send');
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 antialiased selection:bg-amber-500/30 selection:text-amber-200">
      
      {/* Top Navigation Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        deviceInfo={deviceInfo}
        onOpenDeviceSettings={() => setIsDeviceModalOpen(true)}
        soundEnabled={soundOn}
        onToggleSound={handleToggleSound}
        hasActiveSharesCount={activeSharesCount}
        serverConfig={serverConfig}
        onShowToast={showToast}
      />

      {/* Main App Body */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeTab === 'send' && (
          <SenderScreen
            deviceInfo={deviceInfo}
            onShareCreated={handleShareCreated}
            onShowToast={showToast}
            onNavigateToReceive={handleNavigateToReceive}
          />
        )}

        {activeTab === 'receive' && (
          <ReceiverScreen
            initialShareId={initialReceiveId}
            onShowToast={showToast}
            onNavigateToSend={() => setActiveTab('send')}
          />
        )}

        {activeTab === 'radar' && (
          <NearbyRadar
            deviceInfo={deviceInfo}
            onSelectPeerToSend={handleSelectPeerFromRadar}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'history' && (
          <HistoryScreen
            onSelectShare={(share) => {
              setInitialReceiveId(share.id);
              setActiveTab('receive');
            }}
            onNavigateToReceive={handleNavigateToReceive}
            onShowToast={showToast}
          />
        )}
      </main>

      {/* Feature Highlights Grid */}
      <section className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 border-t border-zinc-900">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-zinc-900/30 border border-zinc-850 flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-200">Zero-Install Cross Platform</h3>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                Seamlessly transfer between iOS, Android, macOS, Windows, and Linux via direct browser QR codes.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/30 border border-zinc-850 flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-200">Self-Destructing Links</h3>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                Transfers auto-expire after 5m, 15m, or 1h with optional 4-digit PIN security keys.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/30 border border-zinc-850 flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-200">Instant Safe Previews</h3>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                Stream audio waveforms, high-res photos, videos, and code syntax before downloading.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-zinc-900 py-6 bg-zinc-950/60 text-xs text-zinc-500">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-400">AirDrop Web</span>
            <span aria-hidden="true">·</span>
            <span>Fast Cross-Device File Transmission</span>
          </div>
          <div className="flex items-center gap-4 text-zinc-400">
            <span>Encrypted Session</span>
            <span aria-hidden="true">·</span>
            <span>Max 100 MB</span>
          </div>
        </div>
      </footer>

      {/* Device Identity Modal */}
      <DeviceSettingsModal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        deviceInfo={deviceInfo}
        onUpdateDeviceInfo={setDeviceInfo}
        onShowToast={showToast}
      />

      {/* Global Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

    </div>
  );
}
