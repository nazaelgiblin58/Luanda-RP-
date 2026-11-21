/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { GameSettings, GraphicsQuality, HudPreferences, normalizeGraphicsQuality, WeatherMode, WeatherType } from '../../game/types';
import { WEATHER_CATALOG } from '../../game/data/catalog';
import { Settings, Monitor, Volume2, Clock, X, ShieldCheck, Camera, Layout, CloudSun } from 'lucide-react';
import { soundFx } from '../../game/audio/soundFx';

interface Props {
  settings: GameSettings;
  hudPrefs: HudPreferences;
  timeOfDay: number;
  weatherMode?: WeatherMode;
  onUpdateSettings: (newSettings: GameSettings) => void;
  onUpdateHudPrefs: (prefs: HudPreferences) => void;
  onSetTimeOfDay: (hour: number) => void;
  onSetWeatherMode?: (mode: WeatherMode, weather?: WeatherType) => void;
  onClose: () => void;
}

const QUALITY_INFO: Record<GraphicsQuality, string> = {
  low: 'Baixa: sem sombras dinâmicas e sem nuvens, máxima fluidez em qualquer dispositivo.',
  medium: 'Média: sombras padrão 1024px, nuvens suaves e equilíbrio estável entre detalhe e FPS.',
  high: 'Alta: sombras suaves 1536px, nuvens, chuva densa e iluminação/reflexos PBR completos.',
};

export const SettingsModal: React.FC<Props> = ({
  settings,
  hudPrefs,
  weatherMode = 'auto',
  onUpdateSettings,
  onUpdateHudPrefs,
  onSetTimeOfDay,
  onSetWeatherMode,
  onClose,
}) => {
  const handleQualityChange = (q: GraphicsQuality) => {
    soundFx.playInteract();
    onUpdateSettings({
      ...settings,
      graphicsQuality: q,
      shadows: q !== 'low',
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[999] pointer-events-auto flex items-center justify-center p-4 bg-black/80"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative z-10 pointer-events-auto w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-5 sm:p-6 text-white max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-zinc-800 text-amber-400 rounded-lg">
              <Settings size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Definições do Jogo</h2>
              <p className="text-xs text-zinc-400">LUANDA RP 🇦🇴 · Gráficos, HUD, Câmera e Áudio</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 my-5">
          {/* Qualidade Gráfica Real (3 Níveis: Baixa, Média, Alta) */}
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
              <Monitor size={15} className="text-amber-400" /> Desempenho Gráfico
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as GraphicsQuality[]).map((lvl) => {
                const activeQuality = normalizeGraphicsQuality(settings.graphicsQuality);
                return (
                  <button
                    type="button"
                    key={lvl}
                    onClick={() => handleQualityChange(lvl)}
                    className={`min-h-[40px] py-2 px-2 rounded-lg text-xs font-semibold uppercase border transition cursor-pointer ${
                      activeQuality === lvl
                        ? 'bg-amber-500 text-zinc-950 border-amber-400'
                        : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                    }`}
                  >
                    {lvl === 'low' ? 'Baixa' : lvl === 'medium' ? 'Média' : 'Alta'}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1.5">{QUALITY_INFO[normalizeGraphicsQuality(settings.graphicsQuality)]}</p>
          </div>

          {/* Personalização do HUD */}
          <div className="space-y-3 p-3.5 bg-zinc-800/50 rounded-xl border border-zinc-700/70">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase">
              <Layout size={14} /> Personalização do HUD
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1 tabular-nums">
                <span>Escala do HUD Desktop</span>
                <span className="font-mono text-amber-400">{Math.round((hudPrefs.hudScale || 1) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.85"
                max="1.20"
                step="0.05"
                value={hudPrefs.hudScale}
                onChange={(e) => onUpdateHudPrefs({ ...hudPrefs, hudScale: parseFloat(e.target.value) })}
                className="w-full accent-amber-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
              <button
                type="button"
                onClick={() => onUpdateHudPrefs({ ...hudPrefs, showMinimap: !hudPrefs.showMinimap })}
                className={`min-h-[40px] px-2.5 py-1.5 rounded-lg font-bold border cursor-pointer ${
                  hudPrefs.showMinimap
                    ? 'bg-amber-500 text-zinc-950 border-amber-400'
                    : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                }`}
              >
                Minimapa: {hudPrefs.showMinimap ? 'Sim' : 'Não'}
              </button>
              <button
                type="button"
                onClick={() => onUpdateHudPrefs({ ...hudPrefs, showChatPreview: !hudPrefs.showChatPreview })}
                className={`min-h-[40px] px-2.5 py-1.5 rounded-lg font-bold border cursor-pointer ${
                  hudPrefs.showChatPreview
                    ? 'bg-amber-500 text-zinc-950 border-amber-400'
                    : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                }`}
              >
                Prévia Chat: {hudPrefs.showChatPreview ? 'Sim' : 'Não'}
              </button>
              <button
                type="button"
                onClick={() => onUpdateHudPrefs({ ...hudPrefs, showQuickHints: !hudPrefs.showQuickHints })}
                className={`min-h-[40px] px-2.5 py-1.5 rounded-lg font-bold border cursor-pointer ${
                  hudPrefs.showQuickHints
                    ? 'bg-amber-500 text-zinc-950 border-amber-400'
                    : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                }`}
              >
                Dicas Teclas: {hudPrefs.showQuickHints ? 'Sim' : 'Não'}
              </button>
            </div>
          </div>

          {/* Câmera & Alcance */}
          <div className="space-y-3 p-3.5 bg-zinc-800/50 rounded-xl border border-zinc-700/70">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase">
              <Camera size={14} /> Câmera & Desenho 3D
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1 tabular-nums">
                <span>Sensibilidade</span>
                <span className="font-mono text-amber-400">{settings.cameraSensitivity.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="2.0"
                step="0.1"
                value={settings.cameraSensitivity}
                onChange={(e) => onUpdateSettings({ ...settings, cameraSensitivity: parseFloat(e.target.value) })}
                className="w-full accent-amber-500"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1 tabular-nums">
                <span>Distância de Renderização</span>
                <span className="font-mono text-amber-400">{settings.renderDistance}m</span>
              </div>
              <input
                type="range"
                min="250"
                max="800"
                step="25"
                value={settings.renderDistance}
                onChange={(e) => onUpdateSettings({ ...settings, renderDistance: parseInt(e.target.value, 10) })}
                className="w-full accent-amber-500"
              />
            </div>
            <div className="flex items-center justify-between text-xs pt-1">
              <span>Inverter Eixo Vertical (Y)</span>
              <button
                type="button"
                onClick={() => onUpdateSettings({ ...settings, invertY: !settings.invertY })}
                className={`min-h-[38px] px-3 py-1 rounded-lg font-bold cursor-pointer ${
                  settings.invertY ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-700 text-zinc-300'
                }`}
              >
                {settings.invertY ? 'Ativo' : 'Desligado'}
              </button>
            </div>

            <div className="pt-2 border-t border-zinc-700/60 space-y-2.5">
              <div>
                <div className="flex justify-between text-xs mb-1.5 tabular-nums">
                  <span>Limite de FPS</span>
                  <span className="font-mono text-amber-400">{settings.targetFps ?? 60} FPS</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {([30, 45, 60, 120] as const).map((fps) => (
                    <button
                      type="button"
                      key={fps}
                      onClick={() => onUpdateSettings({ ...settings, targetFps: fps })}
                      className={`min-h-[36px] rounded-lg text-xs font-bold border cursor-pointer tabular-nums ${
                        (settings.targetFps ?? 60) === fps
                          ? 'bg-amber-500 text-zinc-950 border-amber-400'
                          : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                      }`}
                    >
                      {fps}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span>Escala Dinâmica de Resolução (FPS)</span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings({
                      ...settings,
                      autoScaleResolution: !(settings.autoScaleResolution ?? true),
                    })
                  }
                  className={`min-h-[36px] px-3 py-1 rounded-lg font-bold cursor-pointer ${
                    (settings.autoScaleResolution ?? true)
                      ? 'bg-emerald-600 text-white'
                      : 'bg-zinc-700 text-zinc-300'
                  }`}
                >
                  {(settings.autoScaleResolution ?? true) ? 'Ativa' : 'Fixa'}
                </button>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1 tabular-nums">
                  <span>Escala de Resolução Base</span>
                  <span className="font-mono text-amber-400">
                    {Math.round((settings.resolutionScale ?? 1) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.65"
                  max="1.25"
                  step="0.05"
                  value={settings.resolutionScale ?? 1}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, resolutionScale: parseFloat(e.target.value) })
                  }
                  className="w-full accent-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Volume de Som e Silenciar */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 uppercase">
                <Volume2 size={15} className="text-amber-400" /> Áudio Geral
              </label>
              <button
                type="button"
                onClick={() => onUpdateSettings({ ...settings, muted: !settings.muted })}
                className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-bold cursor-pointer ${
                  settings.muted ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-300'
                }`}
              >
                {settings.muted ? 'Silenciado' : 'Som Ativo'}
              </button>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.soundVolume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                soundFx.setVolume(v);
                onUpdateSettings({ ...settings, soundVolume: v });
              }}
              className="w-full accent-amber-500"
            />
          </div>

          {/* Clima & Horário */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 uppercase">
                <Clock size={15} className="text-amber-400" /> Clima Local de Luanda
              </label>
              {onSetWeatherMode && (
                <button
                  type="button"
                  onClick={() => onSetWeatherMode('auto')}
                  className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 cursor-pointer ${
                    weatherMode === 'auto'
                      ? 'bg-sky-600 text-white border-sky-400'
                      : 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:border-sky-400'
                  }`}
                >
                  <CloudSun size={14} />
                  <span>API Luanda (Auto)</span>
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {WEATHER_CATALOG.map((w) => (
                <button
                  type="button"
                  key={w.id}
                  onClick={() => {
                    onUpdateSettings({ ...settings, weather: w.id });
                    if (onSetWeatherMode) onSetWeatherMode('manual', w.id);
                  }}
                  className={`min-h-[40px] py-2 px-2 rounded-lg text-xs font-medium border cursor-pointer ${
                    settings.weather === w.id
                      ? 'bg-amber-500 text-zinc-950 font-bold border-amber-400'
                      : 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:border-amber-400'
                  }`}
                >
                  {w.shortLabel}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
              {[
                { label: '09h Manhã', hour: 9 },
                { label: '13h Calor/Dia', hour: 13 },
                { label: '18h Pôr-do-Sol', hour: 18 },
                { label: '21h Noite', hour: 21 },
              ].map((preset) => (
                <button
                  type="button"
                  key={preset.hour}
                  onClick={() => onSetTimeOfDay(preset.hour)}
                  className="min-h-[38px] py-1.5 rounded-lg text-xs bg-zinc-800 border border-zinc-700 hover:border-amber-500 text-zinc-200 cursor-pointer tabular-nums"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 bg-zinc-800/60 rounded-xl border border-zinc-700/60 text-xs text-zinc-300 flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
            <span>LUANDA RP · Motor 3D Otimizado & Autoridade Servidor WebSocket</span>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-4 py-2 text-sm bg-amber-500 text-zinc-950 font-bold rounded-lg hover:bg-amber-400 cursor-pointer"
          >
            Guardar e Fechar
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
