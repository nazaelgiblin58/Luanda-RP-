/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { GpsWaypoint, InventoryItem, PlayerStats, PropertyRecord } from '../../game/types';
import { api, CharacterRecord } from '../../services/api';
import {
  Home,
  Building2,
  Key,
  Vault,
  AlertCircle,
  CheckCircle2,
  Navigation,
  X,
  BedDouble,
  Package,
  Utensils,
  Droplets,
  UserPlus,
  Trash2,
  DoorOpen,
  Briefcase,
} from 'lucide-react';
import { soundFx } from '../../game/audio/soundFx';

interface Props {
  characterId: string;
  stats: PlayerStats;
  inventory?: InventoryItem[];
  initialTab?: 'houses' | 'businesses';
  focusedPropertyId?: string | null;
  isInsideHouse?: boolean;
  onEnterHouse?: (prop: PropertyRecord) => void;
  onCookingStarted?: (dishName: string) => void;
  onCharacterSynced: (char: CharacterRecord) => void;
  onPropertiesUpdated?: (props: PropertyRecord[]) => void;
  onSetGpsWaypoint: (wp: GpsWaypoint) => void;
  onClose: () => void;
}

export const PropertyModal: React.FC<Props> = ({
  characterId,
  stats,
  inventory = [],
  initialTab = 'houses',
  focusedPropertyId = null,
  isInsideHouse = false,
  onEnterHouse,
  onCookingStarted,
  onCharacterSynced,
  onPropertiesUpdated,
  onSetGpsWaypoint,
  onClose,
}) => {
  const [tab, setTab] = useState<'houses' | 'businesses'>(
    initialTab === 'businesses' ? 'businesses' : 'houses'
  );
  const [houseFilter, setHouseFilter] = useState<'all' | 'condominio' | 'T1' | 'T2' | 'T3' | 'T4'>('all');
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [citizens, setCitizens] = useState<{ id: string; name: string; idNumber: string }[]>([]);
  const [shareCharByProp, setShareCharByProp] = useState<Record<string, string>>({});
  const [safeAmt, setSafeAmt] = useState(5000);
  const [openStashId, setOpenStashId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const loadProperties = useCallback(async () => {
    try {
      const [pRes, cadRes] = await Promise.all([
        api.getProperties(),
        api.getJusticeCad('').catch(() => ({ citizens: [] })),
      ]);
      setProperties(pRes.properties);
      const otherCits = (cadRes.citizens || []).filter((c) => c.id !== characterId);
      setCitizens(otherCits);
      if (otherCits.length > 0) {
        setShareCharByProp((prev) => {
          const next = { ...prev };
          pRes.properties.forEach((pr) => {
            if (!next[pr.id]) next[pr.id] = otherCits[0].id;
          });
          return next;
        });
      }
    } catch {} finally {
      setLoadingProps(false);
    }
  }, [characterId]);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  const execProp = async (
    propId: string,
    action:
      | 'buy'
      | 'rent'
      | 'sell'
      | 'set_home'
      | 'add_key'
      | 'remove_key'
      | 'safe_deposit'
      | 'safe_withdraw'
      | 'collect_revenue'
      | 'pay_bills'
      | 'pay_ende'
      | 'pay_epal'
      | 'pay_sonagol'
      | 'hire'
      | 'hire_self'
      | 'fire'
      | 'start_business_job'
      | 'rest_cook'
      | 'rest_collect_plate'
      | 'rest_wash_plate'
      | 'boutique_craft'
      | 'boutique_sell'
      | 'rest'
      | 'cook_eat'
      | 'hygiene'
      | 'stash_store'
      | 'stash_take',
    opts?: { itemId?: string; targetCharId?: string }
  ) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.propertyAction(propId, characterId, action, {
        amountKz: safeAmt,
        itemId: opts?.itemId,
        targetCharId: opts?.targetCharId,
      });
      if (action === 'rest') soundFx.playBedSleepSound();
      else soundFx.playCashRegister();
      onCharacterSynced(res.character);
      setProperties(res.properties);
      onPropertiesUpdated?.(res.properties);
      if ((action === 'cook_eat' || action === 'rest_cook') && res.dishName) {
        onCookingStarted?.(res.dishName);
      }
      const msg =
        res.message ||
        (typeof res.workerPayKz === 'number'
          ? `Recebeste +${res.workerPayKz.toLocaleString('pt-AO')} Kz (40% trabalhador / 60% dono)!`
          : `Operação '${action}' concluída com sucesso!`);
      setFeedback({ type: 'ok', msg });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro imobiliário.' });
    } finally {
      setLoading(false);
    }
  };

  const houses = properties.filter((p) => p.type !== 'business');
  const businesses = properties.filter((p) => p.type === 'business');
  const focusedProp = focusedPropertyId
    ? properties.find((p) => p.id === focusedPropertyId) || null
    : null;
  const focusedHasKey = Boolean(
    focusedProp &&
      (focusedProp.ownerId === characterId ||
        focusedProp.renterId === characterId ||
        focusedProp.sharedKeys?.includes(characterId))
  );
  const filteredHouses = houses.filter((h) => {
    if (houseFilter === 'all') return true;
    if (houseFilter === 'condominio') return Boolean(h.inCondominio);
    return h.category === houseFilter;
  });

  const renderPropertyList = (list: PropertyRecord[]) => (
    <div className="space-y-3">
      {list.map((p) => {
        const isOwner = p.ownerId === characterId;
        const isRenter = p.renterId === characterId;
        const hasSharedKey = Boolean(p.sharedKeys && p.sharedKeys.includes(characterId));
        const isEmployee = Boolean(p.employees?.some((e) => e.characterId === characterId));
        const hasKey = isOwner || isRenter || hasSharedKey;
        const isPrimaryHome = stats.homePropertyId === p.id;
        const shareTarget = shareCharByProp[p.id] || citizens[0]?.id || '';
        const endeKz = p.bills?.endeKz ?? Math.round((p.unpaidBillsKz || 0) * 0.5);
        const epalKz = p.bills?.epalKz ?? Math.round((p.unpaidBillsKz || 0) * 0.3);
        const sonagolKz = p.bills?.sonagolKz ?? Math.max(0, (p.unpaidBillsKz || 0) - endeKz - epalKz);
        const totalBills = endeKz + epalKz + sonagolKz;
        const isRestaurant =
          p.type === 'business' &&
          (p.businessCategory === 'restaurant' || p.id.includes('restaurante'));

        return (
          <div
            key={p.id}
            className={`p-4 rounded-xl border space-y-2.5 ${
              hasKey ? 'bg-emerald-950/25 border-emerald-500/60' : 'bg-zinc-800/60 border-zinc-700/70'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {p.type === 'business' ? (
                    <Building2 size={16} className="text-amber-400" />
                  ) : (
                    <Home size={16} className="text-emerald-400" />
                  )}
                  <h4 className="font-bold text-sm text-white">{p.name}</h4>
                  <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-zinc-300">
                    {p.category || p.type} · {p.district}
                  </span>
                  {p.inCondominio && (
                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Condomínio Fechado
                    </span>
                  )}
                  {isPrimaryHome && (
                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-emerald-600/30 text-emerald-300 border border-emerald-500/50">
                      Residência Principal
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-400 mt-1 flex flex-wrap gap-3 tabular-nums">
                  <span>
                    Compra: <strong className="text-emerald-400">{p.priceKz.toLocaleString('pt-AO')} Kz</strong>
                  </span>
                  <span>
                    Renda: <strong className="text-amber-400">{p.rentKz.toLocaleString('pt-AO')} Kz</strong>
                  </span>
                  <span>Dono: {p.ownerName || 'Estado (Disponível)'}</span>
                  {p.renterName && <span>Inquilino: {p.renterName}</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSetGpsWaypoint({ label: p.name, x: p.position[0], z: p.position[2] });
                  onClose();
                }}
                className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-lg text-xs flex items-center gap-1 cursor-pointer"
              >
                <Navigation size={12} /> GPS
              </button>
            </div>

            {hasKey && (
              <div className="p-2.5 bg-zinc-900/70 rounded-lg border border-zinc-700/60 text-xs space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <span className="text-amber-300 font-mono tabular-nums block">
                      Cofre: {p.safeKz.toLocaleString('pt-AO')} Kz · Impostos & Faturas: {totalBills.toLocaleString('pt-AO')} Kz
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono tabular-nums">
                      <span className={`px-1.5 py-0.5 rounded border ${endeKz > 0 ? 'bg-red-950/60 border-red-500/60 text-red-200' : 'bg-zinc-950 border-zinc-700 text-emerald-300'}`}>
                        ⚡ ENDE (Energia): {endeKz.toLocaleString('pt-AO')} Kz
                      </span>
                      <span className={`px-1.5 py-0.5 rounded border ${epalKz > 0 ? 'bg-sky-950/50 border-sky-500/50 text-sky-200' : 'bg-zinc-950 border-zinc-700 text-emerald-300'}`}>
                        💧 EPAL (Água): {epalKz.toLocaleString('pt-AO')} Kz
                      </span>
                      <span className={`px-1.5 py-0.5 rounded border ${sonagolKz > 0 ? 'bg-amber-950/50 border-amber-500/50 text-amber-200' : 'bg-zinc-950 border-zinc-700 text-emerald-300'}`}>
                        🔥 SONAGOL (Gás): {sonagolKz.toLocaleString('pt-AO')} Kz
                      </span>
                    </div>
                    {endeKz > 0 && p.type !== 'business' && (
                      <div className="text-[10px] font-bold text-red-300">
                        ⚠️ Energia ENDE em atraso — ao entrar na casa ficará totalmente escuro até pagares a ENDE!
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.type !== 'business' && !isPrimaryHome && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => execProp(p.id, 'set_home')}
                        className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 rounded font-bold cursor-pointer"
                      >
                        Definir Residência
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => execProp(p.id, 'rest')}
                      className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 rounded font-bold flex items-center gap-1 pointer-events-auto cursor-pointer"
                    >
                      <BedDouble size={12} /> Dormir (Sono 100%)
                    </button>
                    {p.type !== 'business' && (
                      <>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => execProp(p.id, 'cook_eat')}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 rounded font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Utensils size={12} /> Cozinhar (+Fome)
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => execProp(p.id, 'hygiene')}
                          className="px-2.5 py-1 bg-cyan-700 hover:bg-cyan-600 rounded font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Droplets size={12} /> Banho (+Higiene)
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setOpenStashId(openStashId === p.id ? null : p.id)}
                      className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 rounded font-bold flex items-center gap-1 pointer-events-auto cursor-pointer"
                    >
                      <Package size={12} /> Baú ({(p.stash || []).length})
                    </button>
                    {(isOwner || isRenter) && (
                      <>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => execProp(p.id, 'safe_deposit')}
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 rounded font-bold pointer-events-auto cursor-pointer"
                        >
                          Guardar Cofre
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => execProp(p.id, 'safe_withdraw')}
                          className="px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 rounded font-bold pointer-events-auto cursor-pointer"
                        >
                          Levantar Cofre
                        </button>
                      </>
                    )}
                    {(isOwner || isRenter) && endeKz > 0 && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => execProp(p.id, 'pay_ende')}
                        className="px-2.5 py-1 bg-yellow-500 hover:bg-yellow-400 text-zinc-950 rounded font-bold pointer-events-auto cursor-pointer"
                      >
                        Pagar ENDE ({endeKz} Kz)
                      </button>
                    )}
                    {(isOwner || isRenter) && epalKz > 0 && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => execProp(p.id, 'pay_epal')}
                        className="px-2.5 py-1 bg-sky-500 hover:bg-sky-400 text-zinc-950 rounded font-bold pointer-events-auto cursor-pointer"
                      >
                        Pagar EPAL ({epalKz} Kz)
                      </button>
                    )}
                    {(isOwner || isRenter) && sonagolKz > 0 && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => execProp(p.id, 'pay_sonagol')}
                        className="px-2.5 py-1 bg-orange-500 hover:bg-orange-400 text-zinc-950 rounded font-bold pointer-events-auto cursor-pointer"
                      >
                        Pagar SONAGOL ({sonagolKz} Kz)
                      </button>
                    )}
                    {totalBills > 0 && (isOwner || isRenter) && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => execProp(p.id, 'pay_bills')}
                        className="px-2.5 py-1 bg-amber-500 text-zinc-950 rounded font-bold pointer-events-auto cursor-pointer"
                      >
                        Pagar Tudo ({totalBills.toLocaleString('pt-AO')} Kz)
                      </button>
                    )}
                    {isOwner && p.type === 'business' && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => execProp(p.id, 'collect_revenue')}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 rounded font-bold pointer-events-auto cursor-pointer"
                      >
                        Recolher Lucro (+{(p.revenueKz || 3500).toLocaleString('pt-AO')} Kz)
                      </button>
                    )}
                  </div>
                </div>

                {isOwner && p.type !== 'business' && (
                  <div className="pt-2 border-t border-zinc-800 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold text-amber-300">Partilhar Chave da Casa:</span>
                      <select
                        value={shareTarget}
                        onChange={(e) =>
                          setShareCharByProp((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                        className="px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-[11px]"
                      >
                        {citizens.length === 0 && <option value="">Sem outros cidadãos</option>}
                        {citizens.map((cz) => (
                          <option key={cz.id} value={cz.id}>
                            {cz.name} ({cz.idNumber})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={loading || !shareTarget}
                        onClick={() => execProp(p.id, 'add_key', { targetCharId: shareTarget })}
                        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 text-zinc-950 font-black rounded text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        <UserPlus size={12} /> Dar Chave
                      </button>
                    </div>
                    {(p.sharedKeys || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {(p.sharedKeys || []).map((kid) => {
                          const cInfo = citizens.find((c) => c.id === kid);
                          return (
                            <span
                              key={kid}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-zinc-950 border border-zinc-700 rounded text-[11px]"
                            >
                              {cInfo ? cInfo.name : kid}
                              <button
                                type="button"
                                onClick={() => execProp(p.id, 'remove_key', { targetCharId: kid })}
                                className="text-red-400 hover:text-red-300 cursor-pointer"
                                title="Revogar Chave"
                              >
                                <Trash2 size={11} />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {openStashId === p.id && (
                  <div className="pt-2 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] font-bold text-emerald-300 mb-1">No Baú do Imóvel</div>
                      {(p.stash || []).length === 0 ? (
                        <p className="text-[11px] text-zinc-500">Baú vazio.</p>
                      ) : (
                        <div className="space-y-1 max-h-28 overflow-y-auto">
                          {(p.stash || []).map((st) => (
                            <div key={st.id} className="flex items-center justify-between bg-zinc-950/70 px-2 py-1 rounded">
                              <span className="truncate">{st.name} (x{st.quantity})</span>
                              <button
                                type="button"
                                disabled={loading}
                                onClick={() => execProp(p.id, 'stash_take', { itemId: st.id })}
                                className="px-2 py-0.5 bg-amber-500 text-zinc-950 font-bold rounded text-[10px] pointer-events-auto cursor-pointer"
                              >
                                Retirar
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-[11px] font-bold text-amber-300 mb-1">Guardar da Mochila</div>
                      {inventory.length === 0 ? (
                        <p className="text-[11px] text-zinc-500">Mochila vazia.</p>
                      ) : (
                        <div className="space-y-1 max-h-28 overflow-y-auto">
                          {inventory.map((it) => (
                            <div key={it.id} className="flex items-center justify-between bg-zinc-950/70 px-2 py-1 rounded">
                              <span className="truncate">{it.name} (x{it.quantity})</span>
                              <button
                                type="button"
                                disabled={loading}
                                onClick={() => execProp(p.id, 'stash_store', { itemId: it.id })}
                                className="px-2 py-0.5 bg-emerald-600 text-white font-bold rounded text-[10px] pointer-events-auto cursor-pointer"
                              >
                                Guardar
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {focusedPropertyId && hasKey && p.type !== 'business' && onEnterHouse && !isInsideHouse && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onEnterHouse(p)}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-lg flex items-center gap-1.5 cursor-pointer shadow-lg"
                >
                  <DoorOpen size={14} /> Entrar na Casa
                </button>
              )}
              {!p.ownerId && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => execProp(p.id, 'buy')}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <Key size={13} /> Comprar ({p.priceKz.toLocaleString('pt-AO')} Kz)
                </button>
              )}
              {!p.renterId && !isOwner && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => execProp(p.id, 'rent')}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold rounded-lg cursor-pointer"
                >
                  Arrendar ({p.rentKz.toLocaleString('pt-AO')} Kz)
                </button>
              )}
              {isOwner && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => execProp(p.id, 'sell')}
                  className="px-3.5 py-1.5 bg-red-700 hover:bg-red-600 text-white text-xs font-bold rounded-lg cursor-pointer"
                >
                  Vender Imóvel (75%)
                </button>
              )}
            </div>

            {p.type === 'business' && (
              <div className="p-3 bg-zinc-950/75 rounded-xl border border-amber-500/40 text-xs space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5">
                    <Briefcase size={14} /> Operação Comercial ({isRestaurant ? 'Restaurante' : 'Boutique'}) · Divisão 40% Trabalhador / 60% Dono
                  </div>
                  <span className="font-mono text-[11px] text-zinc-300">
                    Equipa: {(p.employees || []).length} funcionário(s)
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {!isEmployee && !isOwner && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => execProp(p.id, 'hire_self')}
                      className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded-lg cursor-pointer"
                    >
                      Candidatar / Entrar na Equipa
                    </button>
                  )}
                  {(isEmployee || isOwner) && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => execProp(p.id, 'start_business_job')}
                      className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg cursor-pointer"
                    >
                      Iniciar Turno Empresa
                    </button>
                  )}
                  {(isEmployee || isOwner) && isRestaurant && (
                    <>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => execProp(p.id, 'rest_cook')}
                        className="px-2.5 py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg cursor-pointer"
                      >
                        🍳 Cozinhar Prato
                      </button>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => execProp(p.id, 'rest_collect_plate')}
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg cursor-pointer"
                      >
                        🍽️ Servir Prato ({p.cookedDishesReady || 0})
                      </button>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => execProp(p.id, 'rest_wash_plate')}
                        className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg cursor-pointer"
                      >
                        🧼 Lavar Louça ({p.dirtyPlates || 0})
                      </button>
                    </>
                  )}
                  {(isEmployee || isOwner) && !isRestaurant && (
                    <>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => execProp(p.id, 'boutique_craft')}
                        className="px-2.5 py-1.5 bg-pink-600 hover:bg-pink-500 text-white font-bold rounded-lg cursor-pointer"
                      >
                        ✂️ Produzir Roupa
                      </button>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => execProp(p.id, 'boutique_sell')}
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg cursor-pointer"
                      >
                        👗 Atender Cliente ({p.craftedClothesStock || 0} em stock)
                      </button>
                    </>
                  )}
                </div>

                {isOwner && (
                  <div className="pt-2 border-t border-zinc-800 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold text-zinc-300">Contratar Cidadão:</span>
                      <select
                        value={shareTarget}
                        onChange={(e) =>
                          setShareCharByProp((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                        className="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-[11px]"
                      >
                        {citizens.length === 0 && <option value="">Sem outros cidadãos</option>}
                        {citizens.map((cz) => (
                          <option key={cz.id} value={cz.id}>
                            {cz.name} ({cz.idNumber})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={loading || !shareTarget}
                        onClick={() => execProp(p.id, 'hire', { targetCharId: shareTarget })}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-[11px] cursor-pointer"
                      >
                        Contratar
                      </button>
                    </div>
                    {(p.employees || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {p.employees.map((emp) => (
                          <span
                            key={emp.characterId}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-[11px]"
                          >
                            {emp.name}
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() => execProp(p.id, 'fire', { targetCharId: emp.characterId })}
                              className="text-red-400 hover:text-red-300 cursor-pointer"
                              title="Despedir"
                            >
                              <Trash2 size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[999] pointer-events-auto flex items-center justify-center p-3 sm:p-4 bg-black/80"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative z-10 pointer-events-auto w-full max-w-4xl bg-zinc-900 border-2 border-emerald-500/70 rounded-2xl shadow-2xl p-4 sm:p-6 text-white max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <Home size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                {focusedPropertyId
                  ? focusedProp
                    ? focusedProp.name
                    : 'Residência Selecionada'
                  : 'Condomínio Vila Atlântica (Casas) & Empresas'}
              </h2>
              <p className="text-xs text-zinc-400 tabular-nums">
                Banco BFA: <strong className="text-emerald-400">{stats.bankKz.toLocaleString('pt-AO')} Kz</strong> ·
                Carteira: <strong className="text-amber-400">{stats.cashKz.toLocaleString('pt-AO')} Kz</strong>
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

        {!focusedPropertyId && (
          <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-950 rounded-xl border border-zinc-800 text-xs font-bold my-4">
            <button
              type="button"
              onClick={() => setTab('houses')}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer ${
                tab === 'houses' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Home size={14} /> Casas do Condomínio ({houses.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('businesses')}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer ${
                tab === 'businesses' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Building2 size={14} /> Empresas ({businesses.length})
            </button>
          </div>
        )}

        {(!focusedPropertyId || focusedHasKey) && (
          <div className="my-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Vault size={15} className="text-amber-400" />
              <span>Valor Cofre:</span>
              <input
                type="number"
                min={500}
                value={safeAmt}
                onChange={(e) => setSafeAmt(Number(e.target.value))}
                className="w-28 px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded-lg font-mono tabular-nums"
              />
            </div>

            {!focusedPropertyId && tab === 'houses' && (
              <div className="flex flex-wrap gap-1">
                {(['all', 'condominio', 'T1', 'T2', 'T3', 'T4'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setHouseFilter(f)}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] cursor-pointer ${
                      houseFilter === f
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    {f === 'all' ? `Todas (${houses.length})` : f === 'condominio' ? 'Condomínio' : f}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {feedback && (
          <div
            className={`mb-4 p-2.5 rounded-xl text-xs flex items-center gap-2 border ${
              feedback.type === 'err'
                ? 'bg-red-950/60 border-red-500/60 text-red-200'
                : 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200'
            }`}
          >
            {feedback.type === 'err' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
            <span>{feedback.msg}</span>
          </div>
        )}

        {focusedPropertyId ? (
          loadingProps ? (
            <div className="py-8 text-center text-xs text-zinc-400">A carregar dados desta casa...</div>
          ) : focusedProp ? (
            <div className="mt-3">{renderPropertyList([focusedProp])}</div>
          ) : (
            <div className="py-8 text-center text-xs text-red-300">
              Não foi possível localizar esta residência.
            </div>
          )
        ) : (
          <>
            {tab === 'houses' && renderPropertyList(filteredHouses)}
            {tab === 'businesses' && renderPropertyList(businesses)}
          </>
        )}

        <div className="mt-5 pt-4 border-t border-zinc-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
