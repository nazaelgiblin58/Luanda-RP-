/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { District, GpsWaypoint, InteractableObject } from '../../game/types';
import { MapPin, Navigation, Compass, ZoomIn, ZoomOut, Crosshair, X } from 'lucide-react';
import { soundFx } from '../../game/audio/soundFx';

interface Props {
  districts: District[];
  interactables: InteractableObject[];
  playerPos: { x: number; z: number };
  currentDistrict: string;
  activeGps: GpsWaypoint | null;
  onSetGpsWaypoint: (wp: GpsWaypoint | null) => void;
  onTeleport: (x: number, z: number, name: string) => void;
  onClose: () => void;
}

export const MapModal: React.FC<Props> = ({
  districts,
  interactables,
  playerPos,
  currentDistrict,
  activeGps,
  onSetGpsWaypoint,
  onTeleport,
  onClose,
}) => {
  const [zoom, setZoom] = useState(0.95);
  const [filter, setFilter] = useState<string>('all');

  const toPercent = (val: number, min: number, max: number) =>
    Math.max(2, Math.min(98, ((val - min) / (max - min)) * 100));

  const filteredPois = interactables.filter((i) => {
    if (filter === 'all') return i.type !== 'vehicle';
    if (filter === 'services') return ['police', 'hospital', 'atm', 'court', 'pharmacy', 'station'].includes(i.type);
    if (filter === 'commerce') return ['food', 'market', 'dealership', 'garage', 'workshop', 'clothing', 'property', 'leisure'].includes(i.type);
    if (filter === 'factions') return ['faction_base', 'armory', 'police'].includes(i.type);
    return i.type !== 'vehicle';
  });

  const handleMarkGps = (label: string, x: number, z: number) => {
    soundFx.playInteract();
    onSetGpsWaypoint({ label, x, z });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[999] pointer-events-auto flex items-center justify-center p-4 bg-black/85"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative z-10 pointer-events-auto w-full max-w-4xl bg-zinc-900 border-2 border-blue-500/60 rounded-2xl shadow-2xl p-6 text-white max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
              <Compass size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Mapa-Radar GPS de Luanda 🇦🇴</h2>
              <p className="text-xs text-zinc-400">
                Localização: <strong className="text-amber-400">{currentDistrict}</strong> (X:{Math.round(playerPos.x)}, Z:{Math.round(playerPos.z)})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Controles do Radar */}
        <div className="flex flex-wrap items-center justify-between gap-2 my-3">
          <div className="flex gap-1.5 text-xs">
            {[
              { id: 'all', label: 'Todos POIs' },
              { id: 'services', label: 'Polícia / Saúde / Bancos' },
              { id: 'commerce', label: 'Lojas / Lazer / Casas' },
              { id: 'factions', label: 'Morros / Facções / FAA' },
            ].map((f) => (
              <button
                type="button"
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg font-semibold pointer-events-auto cursor-pointer ${
                  filter === f.id ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {activeGps && (
              <button
                type="button"
                onClick={() => onSetGpsWaypoint(null)}
                className="px-2.5 py-1.5 bg-cyan-500/20 border border-cyan-500 text-cyan-300 text-xs font-bold rounded-lg cursor-pointer"
              >
                Limpar GPS: {activeGps.label} ✕
              </button>
            )}
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.7, z - 0.15))}
              className="p-1.5 bg-zinc-800 rounded-lg hover:bg-zinc-700 cursor-pointer"
            >
              <ZoomOut size={16} />
            </button>
            <span className="text-xs font-mono text-zinc-400">{zoom.toFixed(1)}x</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.2, z + 0.15))}
              className="p-1.5 bg-zinc-800 rounded-lg hover:bg-zinc-700 cursor-pointer"
            >
              <ZoomIn size={16} />
            </button>
          </div>
        </div>

        {/* Radar Visual 2D (Compacto & Expansivo ±460m) */}
        <div className="relative w-full h-60 bg-slate-950 border-2 border-zinc-700 rounded-2xl overflow-hidden mb-5">
          <div
            className="relative w-full h-full transition-transform origin-center"
            style={{ transform: `scale(${zoom})` }}
          >
            {/* Oceano Atlântico à esquerda (x < -52) */}
            <div
              className="absolute inset-y-0 left-0 bg-cyan-950/60 border-r border-cyan-700/40"
              style={{ width: `${toPercent(-52, -460, 460)}%` }}
            />

            {/* Serra / Montanha Leste (x > 335) */}
            <div
              className="absolute inset-y-0 right-0 bg-amber-950/35 border-l border-amber-700/30"
              style={{ width: `${100 - toPercent(335, -460, 460)}%` }}
            />

            {/* Letreiro Monumental LUANDA RP na Montanha */}
            <button
              type="button"
              onClick={() => handleMarkGps('Serra LUANDA RP', 330, 0)}
              style={{
                left: `${toPercent(360, -460, 460)}%`,
                top: `${toPercent(0, -460, 460)}%`,
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 bg-amber-500/90 text-zinc-950 rounded text-[9px] font-black tracking-wider border border-white shadow cursor-pointer"
              title="Letreiro LUANDA RP na Serra (GPS)"
            >
              ⛰️ LUANDA RP
            </button>

            {/* Distritos */}
            {districts.map((d) => (
              <button
                type="button"
                key={d.id}
                onClick={() => handleMarkGps(d.name, d.center[0], d.center[1])}
                style={{
                  left: `${toPercent(d.center[0], -460, 460)}%`,
                  top: `${toPercent(d.center[1], -460, 460)}%`,
                  borderColor: d.color,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 bg-zinc-900/90 border rounded-full text-[9px] font-bold text-white hover:scale-110 transition pointer-events-auto cursor-pointer shadow whitespace-nowrap"
                title={`Marcar GPS: ${d.name}`}
              >
                {d.name}
              </button>
            ))}

            {/* POIs Interativos */}
            {filteredPois.map((poi) => (
              <button
                type="button"
                key={poi.id}
                onClick={() => handleMarkGps(poi.title, poi.position[0], poi.position[2])}
                style={{
                  left: `${toPercent(poi.position[0], -460, 460)}%`,
                  top: `${toPercent(poi.position[2], -460, 460)}%`,
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-black hover:scale-150 transition pointer-events-auto cursor-pointer ${
                  poi.type === 'faction_base' || poi.type === 'armory'
                    ? 'bg-purple-400'
                    : poi.type === 'leisure'
                    ? 'bg-pink-400'
                    : 'bg-amber-400'
                }`}
                title={`${poi.title} (Clica para GPS)`}
              />
            ))}

            {/* Waypoint GPS Ativo */}
            {activeGps && (
              <div
                style={{
                  left: `${toPercent(activeGps.x, -460, 460)}%`,
                  top: `${toPercent(activeGps.z, -460, 460)}%`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-cyan-400 border-2 border-white ring-2 ring-cyan-300/60 shadow-lg"
                title={`GPS: ${activeGps.label}`}
              />
            )}

            {/* Posição do Jogador */}
            <div
              style={{
                left: `${toPercent(playerPos.x, -460, 460)}%`,
                top: `${toPercent(playerPos.z, -460, 460)}%`,
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
              title="A Tua Posição"
            >
              <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow-lg" />
            </div>
          </div>
          <div className="absolute bottom-2 left-3 text-[10px] text-zinc-300 bg-black/80 px-2 py-0.5 rounded">
            🔴 Tu • 🟡 Serviços • 🟣 Morros Isolados • ⛰️ Serra LUANDA RP • 🔵 GPS
          </div>
        </div>

        {/* Lista de Distritos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {districts.map((d) => (
            <div
              key={d.id}
              className={`p-3 rounded-xl border transition ${
                currentDistrict === d.name
                  ? 'bg-amber-500/10 border-amber-500/60'
                  : 'bg-zinc-800/50 border-zinc-700/60'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name}
                </h3>
                {currentDistrict === d.name && (
                  <span className="text-[10px] font-bold uppercase text-amber-400">Aqui</span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mb-2.5">{d.description}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleMarkGps(d.name, d.center[0], d.center[1])}
                  className="flex items-center justify-center gap-1 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/40 text-cyan-300 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  <Crosshair size={13} /> Marcar GPS
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundFx.playCandongueiroHorn();
                    onTeleport(d.center[0], d.center[1], d.name);
                    onClose();
                  }}
                  className="flex items-center justify-center gap-1 py-1.5 bg-zinc-700 hover:bg-amber-500 hover:text-zinc-950 text-zinc-200 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  <Navigation size={13} /> Viajar
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-4 mt-4 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg cursor-pointer"
          >
            Fechar Mapa
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
