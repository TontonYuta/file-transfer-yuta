/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Radio, Volume2, VolumeX, Smartphone, Laptop, Monitor, Sparkles, Wifi } from 'lucide-react';
import { SenderDeviceInfo, ServerConfig } from '../types/share';
import { playBlip } from '../utils/audio';

interface HeaderProps {
  activeTab: 'send' | 'receive' | 'radar' | 'history';
  setActiveTab: (tab: 'send' | 'receive' | 'radar' | 'history') => void;
  deviceInfo: SenderDeviceInfo;
  onOpenDeviceSettings: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  hasActiveSharesCount?: number;
  serverConfig?: ServerConfig | null;
  onShowToast?: (title: string, description?: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  deviceInfo,
  onOpenDeviceSettings,
  soundEnabled,
  onToggleSound,
  hasActiveSharesCount = 0,
  serverConfig,
  onShowToast,
}) => {
  const getDeviceIcon = () => {
    switch (deviceInfo.type) {
      case 'iphone':
      case 'android':
        return <Smartphone className="w-3.5 h-3.5" />;
      case 'mac':
        return <Laptop className="w-3.5 h-3.5" />;
      case 'windows':
      case 'linux':
        return <Monitor className="w-3.5 h-3.5" />;
      default:
        return <Radio className="w-3.5 h-3.5" />;
    }
  };

  const handleTabClick = (tab: 'send' | 'receive' | 'radar' | 'history') => {
    playBlip();
    setActiveTab(tab);
  };

  const handleCopyLan = async () => {
    if (!serverConfig?.lanUrl) return;
    try {
      await navigator.clipboard.writeText(serverConfig.lanUrl);
      playBlip();
      if (onShowToast) {
        onShowToast('Đã sao chép địa chỉ Wi-Fi', serverConfig.lanUrl, 'success');
      }
    } catch {
      // ignore
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-xl transition-all">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => handleTabClick('send')}
            className="flex items-center gap-2.5 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-lg py-1"
          >
            <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500/20 via-zinc-800 to-emerald-500/20 border border-amber-500/30 group-hover:border-amber-400/60 transition-colors shadow-inner">
              <Radio className="w-4 h-4 text-amber-400 animate-pulse" />
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            </div>
            <div>
              <span className="font-display text-lg font-bold tracking-tight text-zinc-100 group-hover:text-white transition-colors">
                AirDrop <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-emerald-400">Web</span>
              </span>
            </div>
          </button>
        </div>

        {/* Zone 2: Navigation Links / Segmented Tabs */}
        <nav className="flex items-center gap-1 p-1 bg-zinc-900/90 rounded-xl border border-zinc-800/90 shadow-inner">
          <button
            onClick={() => handleTabClick('send')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'send'
                ? 'bg-zinc-800 text-amber-300 shadow-sm border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
            }`}
          >
            Send File
          </button>

          <button
            onClick={() => handleTabClick('receive')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'receive'
                ? 'bg-zinc-800 text-emerald-300 shadow-sm border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
            }`}
          >
            Receive
          </button>

          <button
            onClick={() => handleTabClick('radar')}
            className={`hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'radar'
                ? 'bg-zinc-800 text-amber-300 shadow-sm border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400/80" />
            Radar
          </button>

          <button
            onClick={() => handleTabClick('history')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'history'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
            }`}
          >
            Transfers
            {hasActiveSharesCount > 0 && (
              <span className="flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full">
                {hasActiveSharesCount}
              </span>
            )}
          </button>
        </nav>

        {/* Zone 3: Primary Actions */}
        <div className="flex items-center gap-2">
          {/* LAN Wi-Fi Indicator Button */}
          {serverConfig?.lanUrl && (
            <button
              onClick={handleCopyLan}
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-xs font-mono text-zinc-300 transition-all cursor-pointer"
              title="Click để sao chép địa chỉ LAN Wi-Fi"
            >
              <Wifi className="w-3.5 h-3.5 text-amber-400" />
              <span>{serverConfig.lanIp}:{serverConfig.activePort}</span>
            </button>
          )}

          {/* Sound toggle */}
          <button
            onClick={() => {
              onToggleSound();
              playBlip();
            }}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
            title={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
            aria-label="Toggle sound"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-zinc-500" />}
          </button>

          {/* Device Profile Button */}
          <button
            onClick={() => {
              playBlip();
              onOpenDeviceSettings();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-xs font-medium text-zinc-300 transition-all cursor-pointer truncate max-w-[140px] sm:max-w-[190px]"
            title="Configure Device Identity"
          >
            <span className="text-amber-400">{getDeviceIcon()}</span>
            <span className="truncate">{deviceInfo.name}</span>
          </button>
        </div>

      </div>
    </header>
  );
};
