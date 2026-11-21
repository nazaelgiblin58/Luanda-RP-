/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { OwnedVehicleRecord, PlayerStats, SharedWorldVehicle, VehicleSkinPreset } from '../../game/types';
import { VEHICLE_CATALOG, VEHICLE_SKIN_PRESETS } from '../../game/data/catalog';
import { api, CharacterRecord } from '../../services/api';
import {
  Car,
  Wrench,
  Radio,
  Volume2,
  Navigation,
  Lock,
  Unlock,
  Fuel,
  ShieldAlert,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  X,
  Palette,
} from 'lucide-react';
import { soundFx } from '../../game/audio/soundFx';

interface Props {
  characterId: string;
  stats: PlayerStats;
  vehicles: OwnedVehicleRecord[];
  initialTab?: 'garage' | 'dealership' | 'workshop' | 'express';
  playerPos: { x: number; z: number };
  getVehicleMileageKm?: (vehId: string) => number | undefined;
  onStartTestDrive?: (veh: SharedWorldVehicle) => void;
  onCharacterSynced: (char: CharacterRecord, vehicles?: OwnedVehicleRecord[]) => void;
  onSpawnVehicleInWorld: (veh: OwnedVehicleRecord) => void;
  onRemoveVehicleFromWorld: (vehId: string) => void;
  onTeleport: (x: number, z: number, districtName: string) => void;
  onClose: () => void;
}

export const VehicleModal: React.FC<Props> = ({
  characterId,
  stats,
  vehicles,
  initialTab = 'garage',
  playerPos,
  getVehicleMileageKm,
  onStartTestDrive,
  onCharacterSynced,
  onSpawnVehicleInWorld,
  onRemoveVehicleFromWorld,
  onTeleport,
  onClose,
}) => {
  const [tab, setTab] = useState<'garage' | 'dealership' | 'workshop' | 'express'>(initialTab);
  const [dealershipFilter, setDealershipFilter] = useState<'all' | 'sport' | 'suv' | 'work'>('all');
  const [selectedColor, setSelectedColor] = useState('#09090b');
  const [selectedAccent, setSelectedAccent] = useState('#9333ea');
  const [selectedSkinId, setSelectedSkinId] = useState<string>('bmw_m4_purple');
  const [selectedWheel, setSelectedWheel] = useState<OwnedVehicleRecord['wheelStyle']>('desportiva');
  const [radioActive, setRadioActive] = useState(soundFx.getRadioPlaying());
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const formatKz = (val: number) => `${Math.round(val).toLocaleString('pt-AO')} Kz`;

  const applySkinPresetSelection = (skin: VehicleSkinPreset) => {
    soundFx.playInteract();
    setSelectedSkinId(skin.id);
    setSelectedColor(skin.baseColor);
    setSelectedAccent(skin.accentColor);
    setSelectedWheel('desportiva');
  };

  const handleBuyVehicle = async (modelId: string, defaultColor: string, defaultSkinId?: string) => {
    setLoading(true);
    setFeedback(null);
    const preset = defaultSkinId ? VEHICLE_SKIN_PRESETS.find((s) => s.id === defaultSkinId) : undefined;
    try {
      const res = await api.buyVehicle(
        characterId,
        modelId,
        preset?.baseColor || defaultColor,
        defaultSkinId,
        preset?.accentColor
      );
      soundFx.playCashRegister();
      onCharacterSynced(res.character, res.vehicles);
      onSpawnVehicleInWorld(res.vehicle);
      setFeedback({ type: 'ok', msg: `Viatura ${res.vehicle.name} [${res.vehicle.plate}] registada e entregue!` });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro na compra.' });
    } finally {
      setLoading(false);
    }
  };

  const handleVehicleAction = async (
    veh: OwnedVehicleRecord,
    action: 'store' | 'spawn' | 'lock' | 'refuel' | 'repair' | 'paint' | 'upgrade_engine' | 'pay_fine' | 'sell',
    overrideSkin?: VehicleSkinPreset
  ) => {
    setLoading(true);
    setFeedback(null);
    const skinToApply = overrideSkin
      ? overrideSkin.id
      : selectedSkinId || undefined;
    const colorToApply = overrideSkin ? overrideSkin.baseColor : selectedColor;
    const accentToApply = overrideSkin ? overrideSkin.accentColor : selectedAccent;

    try {
      const liveMileage = getVehicleMileageKm?.(veh.id);
      const res = await api.vehicleAction(veh.id, characterId, action, {
        color: colorToApply,
        accentColor: accentToApply,
        skinId: action === 'paint' ? skinToApply : veh.skinId,
        wheelStyle: selectedWheel,
        mileageKm: action === 'store' && typeof liveMileage === 'number' ? liveMileage : veh.mileageKm,
        position: { x: playerPos.x + 4, y: 0, z: playerPos.z + 4 },
        rotationY: 0,
      });
      onCharacterSynced(res.character, res.vehicles);
      if (action === 'store' || action === 'sell') {
        onRemoveVehicleFromWorld(veh.id);
      } else if (res.vehicle && !res.vehicle.isStoredInGarage) {
        onSpawnVehicleInWorld(res.vehicle);
      }
      soundFx.playInteract();
      setFeedback({
        type: 'ok',
        msg: overrideSkin
          ? `Skin "${overrideSkin.name}" aplicada em [${veh.plate}]!`
          : `Operação concluída em [${veh.plate}].`,
      });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro na operação.' });
    } finally {
      setLoading(false);
    }
  };

  const handleTestDrive = async (modelId: string, color: string) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.vehicleTestDrive(characterId, modelId, color);
      soundFx.playVehicleIgnition('sport');
      onStartTestDrive?.(res.vehicle);
      onClose();
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Test Drive indisponível.' });
    } finally {
      setLoading(false);
    }
  };

  const filteredDealership = VEHICLE_CATALOG.filter((cat) => {
    if (dealershipFilter === 'all') return true;
    if (dealershipFilter === 'sport') return cat.type === 'sport' || cat.type === 'supercar' || cat.type === 'muscle';
    if (dealershipFilter === 'suv') return cat.type === 'suv' || cat.type === 'pickup';
    return !['sport', 'supercar', 'muscle', 'suv', 'pickup'].includes(cat.type);
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[999] pointer-events-auto flex items-center justify-center p-3 sm:p-4 bg-black/85"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative z-10 pointer-events-auto w-full max-w-3xl bg-zinc-950 border-2 border-blue-500/80 rounded-2xl shadow-2xl p-5 sm:p-6 text-white max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/25 text-blue-300 rounded-xl border border-blue-500/40">
              <Car size={24} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-wide">
                Garagem, CICOMEX Motors & Skins Luanda RP
              </h2>
              <p className="text-xs sm:text-sm text-zinc-200 mt-0.5">
                Banco: <strong className="text-emerald-300">{formatKz(stats.bankKz)}</strong> • Carteira:{' '}
                <strong className="text-amber-300">{formatKz(stats.cashKz)}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-200 hover:text-white rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1.5 bg-zinc-900 rounded-xl border border-zinc-700 text-xs sm:text-sm font-bold my-4">
          {[
            { id: 'garage', label: `Garagem (${vehicles.length})` },
            { id: 'dealership', label: 'CICOMEX Motors' },
            { id: 'workshop', label: 'Skins & Tuning' },
            { id: 'express', label: 'Candongueiro' },
          ].map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={`py-2.5 px-2 rounded-lg transition cursor-pointer ${
                tab === t.id ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-200 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {feedback && (
          <div
            className={`mb-4 p-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 border ${
              feedback.type === 'err'
                ? 'bg-red-950/80 border-red-500 text-red-100'
                : 'bg-emerald-950/80 border-emerald-500 text-emerald-100'
            }`}
          >
            {feedback.type === 'err' ? (
              <AlertCircle size={16} className="text-red-400 shrink-0" />
            ) : (
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            )}
            <span>{feedback.msg}</span>
          </div>
        )}

        {tab === 'garage' && (
          <div className="space-y-3">
            {vehicles.length === 0 ? (
              <div className="p-8 text-center bg-zinc-900 rounded-xl border border-zinc-700 text-sm text-zinc-200">
                Ainda não compraste nenhuma viatura pessoal. Visita o separador{' '}
                <strong className="text-amber-300">CICOMEX Motors</strong> para ver os carros Luanda Edition!
              </div>
            ) : (
              vehicles.map((v) => {
                const skinObj = v.skinId ? VEHICLE_SKIN_PRESETS.find((s) => s.id === v.skinId) : undefined;
                const kmVal = Number(((getVehicleMileageKm?.(v.id) ?? v.mileageKm) || 0).toFixed(2));
                return (
                  <div
                    key={v.id}
                    className="p-4 bg-zinc-900 border border-zinc-700 rounded-xl space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="w-4 h-4 rounded-full border-2 border-white/60"
                            style={{ background: v.accentColor ? `linear-gradient(135deg, ${v.color} 55%, ${v.accentColor} 55%)` : v.color }}
                          />
                          <span className="font-bold text-base text-white">{v.name}</span>
                          <span className="px-2 py-0.5 bg-blue-600/40 border border-blue-400/50 text-blue-100 font-mono text-xs font-bold rounded">
                            {v.plate}
                          </span>
                          {skinObj && (
                            <span className="px-2 py-0.5 bg-purple-600/40 border border-purple-400/50 text-purple-100 text-xs font-bold rounded">
                              {skinObj.name}
                            </span>
                          )}
                        </div>
                        <div className="text-xs sm:text-sm text-zinc-200 mt-1.5 flex flex-wrap gap-4 font-medium">
                          <span>Combustível: <strong className="text-amber-300">{Math.round(v.fuel)}%</strong></span>
                          <span>Lataria: <strong className="text-emerald-300">{Math.round(v.health)}%</strong></span>
                          <span>Motor <strong className="text-sky-300">Nv.{v.engineLevel}</strong></span>
                          <span>Odómetro: <strong className="text-cyan-300 font-mono">{kmVal} km</strong></span>
                          <span className="text-zinc-100">{v.isStoredInGarage ? '📦 Na Garagem' : '🛣️ Na Rua'}</span>
                        </div>
                      </div>
                      {v.isImpounded && (
                        <span className="px-2.5 py-1 bg-red-600/40 border border-red-400 text-red-100 text-xs font-bold rounded-lg flex items-center gap-1">
                          <ShieldAlert size={14} /> Apreendida ({formatKz(v.finesKz)})
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {v.isImpounded ? (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleVehicleAction(v, 'pay_fine')}
                          className="px-3.5 py-2 bg-red-600 hover:bg-red-500 text-white text-xs sm:text-sm font-bold rounded-lg cursor-pointer"
                        >
                          Pagar Multa ({formatKz(v.finesKz)})
                        </button>
                      ) : v.isStoredInGarage ? (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleVehicleAction(v, 'spawn')}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold rounded-lg cursor-pointer"
                        >
                          Retirar da Garagem
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleVehicleAction(v, 'store')}
                          className="px-3.5 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-xs sm:text-sm font-bold rounded-lg cursor-pointer"
                        >
                          Guardar na Garagem
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleVehicleAction(v, 'lock')}
                        className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-500 text-xs sm:text-sm font-bold text-white rounded-lg flex items-center gap-1.5 cursor-pointer"
                      >
                        {v.isLocked ? <Lock size={14} className="text-red-400" /> : <Unlock size={14} className="text-emerald-400" />}
                        {v.isLocked ? 'Destrancar' : 'Trancar'}
                      </button>

                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => setTab('workshop')}
                        className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs sm:text-sm font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
                      >
                        <Palette size={14} /> Skins
                      </button>

                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleVehicleAction(v, 'sell')}
                        className="px-3.5 py-2 bg-zinc-800 hover:bg-red-900/80 border border-zinc-600 text-xs sm:text-sm font-semibold text-zinc-100 rounded-lg cursor-pointer"
                      >
                        Vender (60%)
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === 'dealership' && (
          <div className="space-y-4">
            {/* Cartazes Oficiais de Skins de Carros */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="rounded-xl overflow-hidden border border-purple-500/60 bg-zinc-900">
                <img
                  src="/assets/aistudio/file_00000000a7d081f48d0961ce07819ddc_bb31a968.png"
                  alt="Catálogo Oficial Carros Lunada RP"
                  className="w-full h-32 object-cover"
                />
                <div className="px-2.5 py-1.5 text-xs font-bold text-purple-200 bg-zinc-950/90">
                  Coleção 1: M4, C63, Urus, GTR, Supra, RS7, 911, Ferrari, Aventador
                </div>
              </div>
              <div className="rounded-xl overflow-hidden border border-amber-500/60 bg-zinc-900">
                <img
                  src="/assets/aistudio/file_000000002d6481f4bff524f326e98d56_2007cd16.png"
                  alt="Lunada Edition Carros Exclusivos"
                  className="w-full h-32 object-cover"
                />
                <div className="px-2.5 py-1.5 text-xs font-bold text-amber-200 bg-zinc-950/90">
                  Coleção 2: M5, E63, Rover, Charger SRT, Camaro, McLaren 720S
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'all', label: 'Todos os Modelos' },
                { id: 'sport', label: 'Desportivos & Supercars' },
                { id: 'suv', label: 'SUVs & Todo-o-Terreno' },
                { id: 'work', label: 'Motos, Táxis & Facções' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setDealershipFilter(f.id as typeof dealershipFilter)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                    dealershipFilter === f.id
                      ? 'bg-amber-500 text-zinc-950 border-amber-300'
                      : 'bg-zinc-900 text-zinc-200 border-zinc-700 hover:bg-zinc-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="space-y-2.5">
              {filteredDealership.map((cat) => {
                const skinPreset = cat.defaultSkinId
                  ? VEHICLE_SKIN_PRESETS.find((s) => s.id === cat.defaultSkinId)
                  : undefined;
                return (
                  <div
                    key={cat.modelId}
                    className="p-3.5 bg-zinc-900 border border-zinc-700 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="w-4 h-4 rounded-full border border-white/70 shrink-0"
                          style={{
                            background: skinPreset
                              ? `linear-gradient(135deg, ${skinPreset.baseColor} 55%, ${skinPreset.accentColor} 55%)`
                              : cat.defaultColor,
                          }}
                        />
                        <h4 className="font-bold text-sm sm:text-base text-white">{cat.name}</h4>
                        <span className="text-xs sm:text-sm font-mono font-black text-amber-300">{formatKz(cat.priceKz)}</span>
                        {skinPreset && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-purple-600/40 border border-purple-400/50 text-purple-100 font-bold">
                            {skinPreset.edition}
                          </span>
                        )}
                        {cat.factionOnly && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-red-600/40 border border-red-400/50 text-red-100 font-bold uppercase">
                            Facção: {cat.factionOnly}
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-zinc-200 mt-1">{cat.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleTestDrive(cat.modelId, skinPreset?.baseColor || cat.defaultColor)}
                        className="px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-amber-400/60 text-amber-300 text-xs font-bold rounded-xl shrink-0 cursor-pointer"
                      >
                        Test Drive (90s)
                      </button>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleBuyVehicle(cat.modelId, cat.defaultColor, cat.defaultSkinId)}
                        className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-black rounded-xl shrink-0 cursor-pointer shadow-lg"
                      >
                        Comprar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'workshop' && (
          <div className="space-y-4">
            {/* Galeria Oficial de Skins Lunada RP */}
            <div className="p-3.5 bg-zinc-900 border border-purple-500/60 rounded-xl space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-black text-purple-300 uppercase">
                  <Sparkles size={16} /> Skins Oficiais dos Carros (Cartaz Lunada RP)
                </div>
                <span className="text-xs font-semibold text-zinc-200">3.000 Kz por aplicação</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                {VEHICLE_SKIN_PRESETS.map((skin) => {
                  const active = selectedSkinId === skin.id;
                  return (
                    <button
                      key={skin.id}
                      type="button"
                      onClick={() => applySkinPresetSelection(skin)}
                      className={`p-2.5 rounded-xl border text-left transition flex items-center gap-3 cursor-pointer ${
                        active
                          ? 'bg-purple-600/35 border-purple-400 ring-2 ring-purple-400/50'
                          : 'bg-zinc-950/90 border-zinc-700 hover:border-purple-500'
                      }`}
                    >
                      <div
                        className="w-10 h-10 rounded-lg border-2 border-white/60 shrink-0 flex items-center justify-center font-black text-[10px] text-white"
                        style={{
                          background: `linear-gradient(135deg, ${skin.baseColor} 52%, ${skin.accentColor} 52%)`,
                          textShadow: '0 1px 3px #000',
                        }}
                      >
                        {skin.badgeText || skin.modelLabel.slice(0, 3)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs sm:text-sm font-bold text-white truncate">{skin.name}</div>
                        <div className="text-[11px] text-zinc-200 font-medium">
                          {skin.edition} • Jante{' '}
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full align-middle border border-white/60"
                            style={{ backgroundColor: skin.rimColor }}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-zinc-800 flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-zinc-200 mr-1">Cor Manual:</span>
                {['#09090b', '#f8fafc', '#dc2626', '#1d4ed8', '#7c3aed', '#06b6d4', '#eab308', '#64748b'].map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => {
                      setSelectedColor(c);
                      setSelectedSkinId('');
                    }}
                    style={{ backgroundColor: c }}
                    className={`w-7 h-7 rounded-full border-2 cursor-pointer ${
                      selectedColor === c && !selectedSkinId ? 'border-amber-400 scale-110' : 'border-zinc-500'
                    }`}
                  />
                ))}
                <select
                  value={selectedWheel}
                  onChange={(e) => setSelectedWheel(e.target.value as OwnedVehicleRecord['wheelStyle'])}
                  className="ml-auto px-3 py-1.5 bg-zinc-950 border border-zinc-600 rounded-lg text-xs font-bold text-white"
                >
                  <option value="padrao">Jantes Padrão</option>
                  <option value="desportiva">Jantes Desportivas</option>
                  <option value="offroad">Jantes Off-Road</option>
                </select>
              </div>
            </div>

            {vehicles.length === 0 ? (
              <p className="text-sm text-zinc-200 text-center py-6 bg-zinc-900 rounded-xl border border-zinc-700">
                Precisas de comprar uma viatura na <strong>CICOMEX Motors</strong> para aplicar skins e tuning.
              </p>
            ) : (
              vehicles.map((v) => (
                <div key={v.id} className="p-3.5 bg-zinc-900 border border-zinc-700 rounded-xl space-y-2.5">
                  <div className="flex justify-between items-center text-xs sm:text-sm font-bold">
                    <span className="text-white">{v.name} [{v.plate}]</span>
                    <span className="text-amber-300">Motor Nv.{v.engineLevel}/3</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleVehicleAction(v, 'refuel')}
                      className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
                    >
                      <Fuel size={14} /> Atestar (1.500 Kz)
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleVehicleAction(v, 'repair')}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
                    >
                      <Wrench size={14} /> Reparar (4.500 Kz)
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleVehicleAction(v, 'paint')}
                      className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
                    >
                      <Palette size={14} /> Aplicar Skin Selecionada (3.000 Kz)
                    </button>
                    {v.engineLevel < 3 && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleVehicleAction(v, 'upgrade_engine')}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg cursor-pointer"
                      >
                        Tuning Motor ({formatKz(12000 * v.engineLevel)})
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'express' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => soundFx.playCandongueiroHorn()}
                className="flex items-center justify-center gap-2 p-3 bg-zinc-900 hover:bg-blue-600/40 border border-zinc-600 rounded-xl text-sm font-bold text-white cursor-pointer"
              >
                <Volume2 size={18} className="text-blue-300" /> Buzinar Bibi!
              </button>
              <button
                type="button"
                onClick={() => setRadioActive(soundFx.toggleRadio())}
                className={`flex items-center justify-center gap-2 p-3 border rounded-xl text-sm font-bold cursor-pointer ${
                  radioActive
                    ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                    : 'bg-zinc-900 border-zinc-600 text-zinc-100'
                }`}
              >
                <Radio size={18} className={radioActive ? 'text-amber-300' : 'text-zinc-300'} />
                {radioActive ? 'Desligar Rádio Luanda FM' : 'Sintonizar Kizomba/Semba'}
              </button>
            </div>
            <div className="space-y-2">
              <span className="text-xs font-bold text-zinc-200 uppercase block">
                Rotas Expressas de Candongueiro (Transporte Público)
              </span>
              {[
                { name: 'Ilha de Luanda & Marginal', x: -28, z: -40, desc: 'Praia, Calçadão e Esplanadas' },
                { name: 'Centro de Luanda & Mutamba', x: 20, z: -10, desc: 'Bancos, Tribunal e Comércio' },
                { name: 'Mercado de Viana & Congolenses', x: 120, z: -30, desc: 'Zona Industrial e Mercado' },
                { name: 'Talatona & Sonangol', x: 100, z: 60, desc: 'Centro Empresarial e Oficina' },
                { name: 'Aeroporto Internacional 4 de Fev.', x: -95, z: -85, desc: 'Terminal Aéreo' },
              ].map((route) => (
                <div
                  key={route.name}
                  className="p-3 bg-zinc-900 border border-zinc-700 rounded-xl flex items-center justify-between gap-3"
                >
                  <div>
                    <h4 className="text-sm font-bold text-white">{route.name}</h4>
                    <p className="text-xs text-zinc-200">{route.desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      soundFx.playCandongueiroHorn();
                      onTeleport(route.x, route.z, route.name);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    <Navigation size={14} /> Embarcar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-zinc-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-sm font-bold bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-white rounded-lg cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
