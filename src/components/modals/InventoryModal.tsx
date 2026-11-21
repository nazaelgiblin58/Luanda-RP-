/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { InventoryItem } from '../../game/types';
import { api, CharacterRecord, DroppedItemRecord } from '../../services/api';
import { Backpack, Package, ArrowDownToLine, Send, Trash2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { soundFx } from '../../game/audio/soundFx';

interface Props {
  characterId: string;
  inventory: InventoryItem[];
  playerPos: { x: number; z: number };
  onCharacterSynced: (char: CharacterRecord) => void;
  onDroppedItemsChanged: (drops: DroppedItemRecord[]) => void;
  onClose: () => void;
}

export const InventoryModal: React.FC<Props> = ({
  characterId,
  inventory,
  playerPos,
  onCharacterSynced,
  onDroppedItemsChanged,
  onClose,
}) => {
  const [drops, setDrops] = useState<DroppedItemRecord[]>([]);
  const [giveTarget, setGiveTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const totalWeight = inventory.reduce((s, i) => s + i.weight * i.quantity, 0);

  const loadDrops = useCallback(async () => {
    try {
      const res = await api.getDroppedItems();
      setDrops(res.droppedItems);
      onDroppedItemsChanged(res.droppedItems);
    } catch {}
  }, [onDroppedItemsChanged]);

  useEffect(() => {
    loadDrops();
  }, [loadDrops]);

  const handleAction = async (item: InventoryItem, action: 'use' | 'equip' | 'sell' | 'drop' | 'give') => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.inventoryAction(characterId, item.id, action, {
        targetQuery: giveTarget,
        x: playerPos.x,
        z: playerPos.z,
      });
      soundFx.playInteract();
      onCharacterSynced(res.character);
      setDrops(res.droppedItems);
      onDroppedItemsChanged(res.droppedItems);
      setFeedback({ type: 'ok', msg: `Ação '${action}' aplicada em ${item.name}.` });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro no inventário.' });
    } finally {
      setLoading(false);
    }
  };

  const handlePickup = async (dropId: string) => {
    setLoading(true);
    try {
      const res = await api.pickupDroppedItem(characterId, dropId);
      soundFx.playInteract();
      onCharacterSynced(res.character);
      setDrops(res.droppedItems);
      onDroppedItemsChanged(res.droppedItems);
      setFeedback({ type: 'ok', msg: 'Objeto apanhado do chão!' });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao apanhar item.' });
    } finally {
      setLoading(false);
    }
  };

  const nearbyDrops = drops.filter((d) => {
    const dx = d.x - playerPos.x;
    const dz = d.z - playerPos.z;
    return Math.sqrt(dx * dx + dz * dz) <= 12;
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[999] pointer-events-auto flex items-center justify-center p-4 bg-black/80"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative z-10 pointer-events-auto w-full max-w-2xl bg-zinc-900 border-2 border-amber-500/70 rounded-2xl shadow-2xl p-6 text-white max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <Backpack size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Mochila & Equipamento</h2>
              <p className="text-xs text-zinc-400">
                Peso atual: <strong className="text-amber-400">{totalWeight.toFixed(1)} kg</strong> / 35.0 kg
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

        {/* Barra de Peso */}
        <div className="my-3 w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 transition-all"
            style={{ width: `${Math.min(100, (totalWeight / 35) * 100)}%` }}
          />
        </div>

        {/* Campo para entregar item a outro cidadão */}
        <div className="mb-4 flex items-center gap-2">
          <input
            type="text"
            value={giveTarget}
            onChange={(e) => setGiveTarget(e.target.value)}
            placeholder="Telefone ou Nome do Cidadão para dar item (Ex: 923123456)"
            className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
          />
        </div>

        {feedback && (
          <div
            className={`mb-3 p-2.5 rounded-xl text-xs flex items-center gap-2 border ${
              feedback.type === 'err'
                ? 'bg-red-950/60 border-red-500/60 text-red-200'
                : 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200'
            }`}
          >
            {feedback.type === 'err' ? (
              <AlertCircle size={15} className="text-red-400 shrink-0" />
            ) : (
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
            )}
            <span>{feedback.msg}</span>
          </div>
        )}

        <div className="space-y-2.5">
          {inventory.map((item) => (
            <div
              key={item.id}
              className="p-3 bg-zinc-800/60 border border-zinc-700/70 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div>
                <div className="flex items-center gap-2">
                  <Package size={15} className="text-amber-400" />
                  <span className="text-sm font-bold text-white">{item.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 font-mono">x{item.quantity}</span>
                  {item.equipped && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold uppercase">
                      Equipado
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">{item.description}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {item.usable && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleAction(item, 'use')}
                    className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold rounded-lg pointer-events-auto cursor-pointer"
                  >
                    {item.category === 'weapon' || item.category === 'phone'
                      ? item.equipped
                        ? 'Desequipar'
                        : 'Equipar'
                      : 'Usar'}
                  </button>
                )}
                {item.sellPriceKz > 0 && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleAction(item, 'sell')}
                    className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Vender ({item.sellPriceKz} Kz)
                  </button>
                )}
                {giveTarget.trim() && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleAction(item, 'give')}
                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Send size={12} /> Dar
                  </button>
                )}
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleAction(item, 'drop')}
                  className="px-2.5 py-1.5 bg-zinc-700 hover:bg-red-700 text-zinc-200 text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
                  title="Largar no chão 3D"
                >
                  <Trash2 size={12} /> Largar
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Itens Largados Próximos no Mundo 3D */}
        {nearbyDrops.length > 0 && (
          <div className="mt-5 pt-4 border-t border-zinc-800 space-y-2">
            <span className="text-xs font-bold uppercase text-cyan-400">Objetos Próximos no Chão (Raio 12m)</span>
            {nearbyDrops.map((d) => (
              <div
                key={d.id}
                className="p-2.5 bg-cyan-950/30 border border-cyan-500/40 rounded-xl flex items-center justify-between text-xs"
              >
                <div>
                  <strong className="text-white">{d.name}</strong>
                  <span className="text-zinc-400 ml-2">(Largado por {d.droppedBy})</span>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handlePickup(d.id)}
                  className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <ArrowDownToLine size={13} /> Apanhar
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-zinc-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg cursor-pointer"
          >
            Fechar Mochila
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
