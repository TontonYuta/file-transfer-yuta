/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Radio,
  Smartphone,
  Laptop,
  Monitor,
  Tablet,
  Send,
  RefreshCw,
  Info,
} from 'lucide-react';
import { PeerDevice, SenderDeviceInfo } from '../types/share';
import { storageService, CURRENT_SESSION_ID } from '../services/storageService';
import { playRadarPing, playChimeSuccess, playBlip } from '../utils/audio';

interface NearbyRadarProps {
  deviceInfo: SenderDeviceInfo;
  onSelectPeerToSend: (peer: PeerDevice) => void;
  onShowToast: (title: string, description?: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const NearbyRadar: React.FC<NearbyRadarProps> = ({
  deviceInfo,
  onSelectPeerToSend,
  onShowToast,
}) => {
  const [isScanning, setIsScanning] = useState(true);
  const [discoveredPeers, setDiscoveredPeers] = useState<PeerDevice[]>([]);
  const [beamingToPeerId, setBeamingToPeerId] = useState<string | null>(null);

  // Ping mesh on mount and listen to real heartbeats
  useEffect(() => {
    storageService.pingMesh();
    playRadarPing();

    const scanTimeout = setTimeout(() => {
      setIsScanning(false);
    }, 1200);

    const peersMap = new Map<string, PeerDevice>();

    const unsubscribe = storageService.onEvent((event) => {
      if (event.type === 'PEER_HEARTBEAT') {
        const sessionId = event.sessionId as string;
        if (sessionId && sessionId !== CURRENT_SESSION_ID) {
          const peer: PeerDevice = {
            id: sessionId,
            sessionId,
            name: (event.name as string) || 'Nearby Device',
            type: (event.deviceType as PeerDevice['type']) || 'browser',
            browser: (event.browser as string) || 'Browser',
            lastSeen: Date.now(),
          };
          peersMap.set(sessionId, peer);
          setDiscoveredPeers(Array.from(peersMap.values()));
        }
      } else if (event.type === 'PEER_LEAVE') {
        const sessionId = event.sessionId as string;
        if (sessionId) {
          peersMap.delete(sessionId);
          setDiscoveredPeers(Array.from(peersMap.values()));
        }
      }
    });

    // Prune inactive peers older than 7 seconds
    const interval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      peersMap.forEach((peer, key) => {
        if (now - peer.lastSeen > 7000) {
          peersMap.delete(key);
          changed = true;
        }
      });
      if (changed) {
        setDiscoveredPeers(Array.from(peersMap.values()));
      }
    }, 3000);

    return () => {
      clearTimeout(scanTimeout);
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const handleRescan = () => {
    setIsScanning(true);
    playRadarPing();
    storageService.pingMesh();

    setTimeout(() => {
      setIsScanning(false);
      onShowToast('Radar Pinged', 'Heartbeat broadcasted across active mesh sessions.', 'info');
    }, 800);
  };

  const handleBeamDirect = (peer: PeerDevice) => {
    playBlip();
    setBeamingToPeerId(peer.id);

    setTimeout(() => {
      setBeamingToPeerId(null);
      playChimeSuccess();
      onSelectPeerToSend(peer);
    }, 400);
  };

  const getPeerIcon = (type: PeerDevice['type']) => {
    switch (type) {
      case 'iphone':
      case 'android':
        return <Smartphone className="w-5 h-5" />;
      case 'mac':
        return <Laptop className="w-5 h-5" />;
      case 'windows':
      case 'linux':
        return <Monitor className="w-5 h-5" />;
      case 'tablet':
        return <Tablet className="w-5 h-5" />;
      default:
        return <Radio className="w-5 h-5" />;
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-800/80">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">
            AirDrop Radar
          </h1>
          <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
            <span>Live Mesh Discovery</span>
            <span aria-hidden="true">·</span>
            <span>Real-time Multi-Session Presence</span>
          </div>
        </div>

        <button
          onClick={handleRescan}
          disabled={isScanning}
          className="px-3.5 py-1.5 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 rounded-xl flex items-center gap-2 transition-colors cursor-pointer self-start sm:self-auto disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-amber-400' : ''}`} />
          {isScanning ? 'Pinging Mesh...' : 'Ping Mesh'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        
        {/* Left: Radar Visualizer (6 cols) */}
        <div className="lg:col-span-6 relative flex items-center justify-center p-10 sm:p-14 rounded-3xl bg-zinc-900/80 border border-zinc-800/90 overflow-hidden min-h-[380px]">
          
          {/* Radar Background Rings */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-80 h-80 rounded-full border border-zinc-800/60" />
            <div className="absolute w-56 h-56 rounded-full border border-zinc-800/80" />
            <div className="absolute w-32 h-32 rounded-full border border-amber-500/20" />
            {isScanning && (
              <>
                <div className="absolute w-44 h-44 rounded-full border border-amber-400/40 animate-radar" />
                <div className="absolute w-72 h-72 rounded-full border border-emerald-400/30 animate-radar-delayed" />
              </>
            )}
          </div>

          {/* Center User Node */}
          <div className="relative z-10 flex flex-col items-center text-center space-y-2">
            <div className="relative p-4 rounded-2xl bg-gradient-to-br from-amber-500/30 via-zinc-800 to-emerald-500/30 border-2 border-amber-400 shadow-xl shadow-amber-950/40">
              <Radio className="w-8 h-8 text-amber-300 animate-pulse" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-zinc-950" />
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-100">{deviceInfo.name}</p>
              <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold">
                Active & Broadcasting
              </span>
            </div>
          </div>

        </div>

        {/* Right: Discovered Real Peers List (6 cols) */}
        <div className="lg:col-span-6 space-y-3">
          <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
            <span className="font-semibold">Active Mesh Sessions ({discoveredPeers.length})</span>
            <span>Live Presence</span>
          </div>

          <div className="space-y-2.5">
            {discoveredPeers.map((peer) => {
              const isBeaming = beamingToPeerId === peer.id;

              return (
                <div
                  key={peer.id}
                  onClick={() => handleBeamDirect(peer)}
                  className={`p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex items-center justify-between group ${
                    isBeaming
                      ? 'bg-amber-500/20 border-amber-400 scale-[1.02]'
                      : 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-zinc-800 border border-zinc-700 p-0.5 flex items-center justify-center text-amber-400 shadow-md">
                      {getPeerIcon(peer.type)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-100 truncate group-hover:text-amber-300 transition-colors">
                        {peer.name}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-zinc-400 mt-0.5">
                        <span>{peer.browser}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-400 font-medium">Online</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      isBeaming
                        ? 'bg-amber-400 text-zinc-950 font-bold'
                        : 'bg-zinc-800 group-hover:bg-amber-400 group-hover:text-zinc-950 text-zinc-200'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    Send File
                  </button>
                </div>
              );
            })}

            {discoveredPeers.length === 0 && (
              <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/70 text-center space-y-3">
                <div className="p-2.5 rounded-xl bg-zinc-800/80 w-fit mx-auto text-zinc-400">
                  <Info className="w-5 h-5" />
                </div>
                <div className="space-y-1 max-w-xs mx-auto">
                  <p className="text-xs font-semibold text-zinc-300">No other active sessions detected</p>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Open AirDrop Web in another browser tab, private window, or on another device on this network to see it appear live on the radar.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
