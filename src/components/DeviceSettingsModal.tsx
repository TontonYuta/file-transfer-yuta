/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Smartphone, Laptop, Monitor, Radio, Save, ShieldCheck, HardDrive } from 'lucide-react';
import { SenderDeviceInfo } from '../types/share';
import { saveCustomDeviceName } from '../services/storageService';
import { playBlip, playChimeSuccess } from '../utils/audio';

interface DeviceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceInfo: SenderDeviceInfo;
  onUpdateDeviceInfo: (info: SenderDeviceInfo) => void;
  onShowToast: (title: string, description?: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export const DeviceSettingsModal: React.FC<DeviceSettingsModalProps> = ({
  isOpen,
  onClose,
  deviceInfo,
  onUpdateDeviceInfo,
  onShowToast,
}) => {
  const [name, setName] = useState(deviceInfo.name);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    saveCustomDeviceName(name);
    onUpdateDeviceInfo({
      ...deviceInfo,
      name: name.trim(),
    });
    playChimeSuccess();
    onShowToast('Device Profile Updated', `Broadcasting as "${name.trim()}"`, 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-5 animate-in zoom-in-95">
        
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Radio className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-zinc-100">Device Identity</h3>
          </div>
          <button
            onClick={() => {
              playBlip();
              onClose();
            }}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              Device Display Name
            </label>
            <input
              type="text"
              value={name}
              maxLength={32}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Greg's MacBook Pro"
              className="w-full px-3.5 py-2.5 text-sm bg-zinc-950 border border-zinc-700 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-amber-400"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              This name is shown to receivers and nearby radar peers during transfers.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80 space-y-2 text-xs">
            <div className="flex items-center justify-between text-zinc-400">
              <span>Platform Type</span>
              <span className="font-semibold text-zinc-200 uppercase">{deviceInfo.type}</span>
            </div>
            <div className="flex items-center justify-between text-zinc-400">
              <span>Browser Engine</span>
              <span className="text-zinc-200">{deviceInfo.browser}</span>
            </div>
            <div className="flex items-center justify-between text-zinc-400">
              <span>Transfer Mode</span>
              <span className="text-emerald-400 font-medium">Encrypted Ephemeral Mesh</span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                playBlip();
                onClose();
              }}
              className="flex-1 py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md"
            >
              <Save className="w-3.5 h-3.5" />
              Save Settings
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
