/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { PlayerStats, ShopItemCatalog } from '../../game/types';
import { SHOP_CATALOG } from '../../game/data/catalog';
import { api, CharacterRecord } from '../../services/api';
import { ShoppingBag, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { soundFx } from '../../game/audio/soundFx';

export type ShopCategoryFilter = 'food' | 'market' | 'pharmacy' | 'workshop' | 'blackmarket' | 'clothing' | 'armory';

interface Props {
  characterId: string;
  stats: PlayerStats;
  shopType: ShopCategoryFilter;
  shopTitle: string;
  onCharacterSynced: (char: CharacterRecord) => void;
  onClose: () => void;
}

export const ShopModal: React.FC<Props> = ({
  characterId,
  stats,
  shopType,
  shopTitle,
  onCharacterSynced,
  onClose,
}) => {
  const [payWith, setPayWith] = useState<'cash' | 'bank'>('cash');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const items = SHOP_CATALOG.filter((item) => item.shopTypes.includes(shopType));
  const formatKz = (val: number) => `${Math.round(val).toLocaleString('pt-AO')} Kz`;

  const handleBuy = async (item: ShopItemCatalog, useImmediately: boolean) => {
    setLoadingId(item.catalogId);
    setFeedback(null);
    try {
      let res = await api.buyShopItem(characterId, item.catalogId, 1, payWith);
      if (useImmediately && item.usable) {
        const boughtItem = res.character.inventory.find((i) => i.catalogId === item.catalogId);
        if (boughtItem) {
          const used = await api.inventoryAction(characterId, boughtItem.id, 'use');
          res = { character: used.character };
        }
      }
      soundFx.playCashRegister();
      onCharacterSynced(res.character);
      setFeedback({
        type: 'ok',
        msg: useImmediately
          ? `Comprou e utilizou ${item.name}!`
          : `${item.name} guardado na sua mochila.`,
      });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Falha na compra.' });
    } finally {
      setLoadingId(null);
    }
  };

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
        className="relative z-10 pointer-events-auto w-full max-w-xl bg-zinc-900 border-2 border-amber-500/70 rounded-2xl shadow-2xl p-6 text-white max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <ShoppingBag size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-amber-400">{shopTitle}</h2>
              <p className="text-xs text-zinc-400">Comércio Oficial de Luanda • Pagamento Cash ou Multicaixa</p>
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

        <div className="flex flex-wrap items-center justify-between gap-2 my-4 p-3 bg-zinc-800/80 rounded-xl border border-zinc-700 text-xs">
          <div>
            <span className="text-zinc-400 mr-2">Carteira:</span>
            <strong className="text-amber-400 font-mono">{formatKz(stats.cashKz)}</strong>
            <span className="text-zinc-600 mx-2">|</span>
            <span className="text-zinc-400 mr-2">Banco:</span>
            <strong className="text-emerald-400 font-mono">{formatKz(stats.bankKz)}</strong>
          </div>
          <div className="flex gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-700">
            <button
              type="button"
              onClick={() => setPayWith('cash')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${
                payWith === 'cash' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400'
              }`}
            >
              Dinheiro
            </button>
            <button
              type="button"
              onClick={() => setPayWith('bank')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${
                payWith === 'bank' ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-400'
              }`}
            >
              Multicaixa
            </button>
          </div>
        </div>

        {shopType === 'armory' && (
          <div
            className={`mb-4 p-2.5 rounded-xl text-xs font-bold border ${
              (stats.weaponLicenseUntil || 0) > Date.now()
                ? 'bg-emerald-950/50 border-emerald-500/60 text-emerald-200'
                : 'bg-red-950/60 border-red-500/60 text-red-200'
            }`}
          >
            {(stats.weaponLicenseUntil || 0) > Date.now()
              ? `🪪 Porte de Arma Válido (expira em ${Math.max(1, Math.ceil(((stats.weaponLicenseUntil || 0) - Date.now()) / (24 * 60 * 60 * 1000)))} dia(s)).`
              : '⚠️ Sem Porte de Arma ativo! Emite o Porte de Arma no Comando PNA (50.000 Kz) para comprar armas legais.'}
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
            {feedback.type === 'err' ? (
              <AlertCircle size={15} className="text-red-400 shrink-0" />
            ) : (
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
            )}
            <span>{feedback.msg}</span>
          </div>
        )}

        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.catalogId}
              className="p-3 bg-zinc-800/60 border border-zinc-700/70 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">{item.name}</h3>
                  <span className="text-xs font-mono font-bold text-amber-400 px-2 py-0.5 bg-amber-500/10 rounded">
                    {formatKz(item.priceKz)}
                  </span>
                  <span className="text-[10px] text-zinc-400">{item.weight} kg</span>
                </div>
                <p className="text-xs text-zinc-400 mt-1">{item.description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={loadingId === item.catalogId}
                  onClick={() => handleBuy(item, false)}
                  className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-bold rounded-lg cursor-pointer"
                >
                  + Mochila
                </button>
                {item.usable && (
                  <button
                    type="button"
                    disabled={loadingId === item.catalogId}
                    onClick={() => handleBuy(item, true)}
                    className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black rounded-lg cursor-pointer"
                  >
                    Comprar & Usar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-zinc-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg cursor-pointer"
          >
            Sair da Loja
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
