/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { PlayerStats, TransactionRecord } from '../../game/types';
import { api, CharacterRecord } from '../../services/api';
import {
  CreditCard,
  ArrowDownRight,
  ArrowUpRight,
  Send,
  Landmark,
  History,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { soundFx } from '../../game/audio/soundFx';

interface Props {
  characterId: string;
  stats: PlayerStats;
  transactions: TransactionRecord[];
  onCharacterSynced: (char: CharacterRecord, txs?: TransactionRecord[]) => void;
  onClose: () => void;
}

export const AtmModal: React.FC<Props> = ({
  characterId,
  stats,
  transactions,
  onCharacterSynced,
  onClose,
}) => {
  const [tab, setTab] = useState<'atm' | 'transfer' | 'loan' | 'history'>('atm');
  const [amount, setAmount] = useState(5000);
  const [target, setTarget] = useState('');
  const [payMode, setPayMode] = useState<'transfer' | 'pay_cash'>('transfer');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const formatKz = (val: number) => `${Math.round(val).toLocaleString('pt-AO')} Kz`;

  const execBank = async (
    action: 'deposit' | 'withdraw' | 'transfer' | 'pay_cash' | 'loan' | 'repay_loan',
    amt: number,
    dest?: string
  ) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.bankAction(characterId, action, amt, dest);
      soundFx.playAtmCash();
      onCharacterSynced(res.character, res.transactions);
      setFeedback({ type: 'ok', msg: `Operação (${action}) de ${formatKz(amt)} concluída no servidor!` });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro bancário.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[999] pointer-events-auto flex items-center justify-center p-4 bg-black/80"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative z-10 pointer-events-auto w-full max-w-lg bg-zinc-900 border-2 border-emerald-500/70 rounded-2xl shadow-2xl p-6 text-white max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <CreditCard size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-emerald-400">MULTICAIXA • BANCO BFA</h2>
              <p className="text-xs text-zinc-400">Rede EMIS Luanda • IBAN/Tel: {stats.phone}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Saldos */}
        <div className="grid grid-cols-3 gap-2.5 my-4">
          <div className="p-3 bg-zinc-800/80 rounded-xl border border-zinc-700">
            <span className="text-[10px] text-zinc-400 uppercase block">Carteira (Cash)</span>
            <span className="text-sm font-black text-amber-400 font-mono">{formatKz(stats.cashKz)}</span>
          </div>
          <div className="p-3 bg-zinc-800/80 rounded-xl border border-zinc-700">
            <span className="text-[10px] text-zinc-400 uppercase block">Conta BFA</span>
            <span className="text-sm font-black text-emerald-400 font-mono">{formatKz(stats.bankKz)}</span>
          </div>
          <div className="p-3 bg-zinc-800/80 rounded-xl border border-zinc-700">
            <span className="text-[10px] text-zinc-400 uppercase block">Crédito Dívida</span>
            <span className="text-sm font-black text-red-400 font-mono">{formatKz(stats.loanBalanceKz)}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-zinc-950 rounded-xl border border-zinc-800 text-xs font-bold mb-4">
          {[
            { id: 'atm', label: 'Caixa' },
            { id: 'transfer', label: 'Transferir' },
            { id: 'loan', label: 'Crédito' },
            { id: 'history', label: 'Extrato' },
          ].map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={`py-2 rounded-lg transition cursor-pointer ${
                tab === t.id ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {feedback && (
          <div
            className={`mb-4 p-3 rounded-xl text-xs flex items-center gap-2 border ${
              feedback.type === 'err'
                ? 'bg-red-950/60 border-red-500/60 text-red-200'
                : 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200'
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

        {tab === 'atm' && (
          <div className="space-y-4">
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min={100}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm font-mono text-white"
              />
              <button
                type="button"
                disabled={loading}
                onClick={() => execBank('withdraw', amount)}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer"
              >
                <ArrowDownRight size={14} /> Levantar
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => execBank('deposit', amount)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer"
              >
                <ArrowUpRight size={14} /> Depositar
              </button>
            </div>

            <div>
              <span className="text-[11px] font-bold text-zinc-400 uppercase block mb-2">Valores Rápidos (Levantar)</span>
              <div className="grid grid-cols-3 gap-2">
                {[2000, 5000, 10000, 20000, 50000, 100000].map((amt) => (
                  <button
                    type="button"
                    disabled={loading}
                    key={amt}
                    onClick={() => execBank('withdraw', amt)}
                    className="py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    -{amt.toLocaleString('pt-AO')} Kz
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'transfer' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPayMode('transfer')}
                className={`py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                  payMode === 'transfer'
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                }`}
              >
                Transferência Bancária (+IVA)
              </button>
              <button
                type="button"
                onClick={() => setPayMode('pay_cash')}
                className={`py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                  payMode === 'pay_cash'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                }`}
              >
                Pagar em Mão (Cash)
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Telefone, BI ou Nome Completo do Destinatário
              </label>
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Ex: 923123456 ou Mauro dos Santos"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Valor em Kwanzas (Kz)</label>
              <input
                type="number"
                min={100}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm font-mono text-white"
              />
            </div>

            <button
              type="button"
              disabled={loading || !target.trim()}
              onClick={() => execBank(payMode, amount, target)}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-black text-xs uppercase rounded-xl flex items-center justify-center gap-2 cursor-pointer"
            >
              <Send size={15} /> Confirmar Envio
            </button>
          </div>
        )}

        {tab === 'loan' && (
          <div className="space-y-3">
            <div className="p-3 bg-zinc-800/70 border border-zinc-700 rounded-xl text-xs text-zinc-300 flex items-start gap-2">
              <Landmark size={18} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-white">Crédito Cidadão BFA (Máx. 100.000 Kz)</p>
                <p className="text-zinc-400 mt-0.5">Taxa de juro fixa de 15% adicionada à dívida. Amortiza quando quiseres.</p>
              </div>
            </div>
            <input
              type="number"
              min={1000}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm font-mono text-white"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => execBank('loan', amount)}
                className="py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs rounded-xl cursor-pointer"
              >
                Pedir Empréstimo
              </button>
              <button
                type="button"
                disabled={loading || stats.loanBalanceKz <= 0}
                onClick={() => execBank('repay_loan', amount)}
                className="py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Amortizar Dívida
              </button>
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {transactions.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500 flex flex-col items-center gap-2">
                <History size={22} />
                <span>Sem movimentos registados.</span>
              </div>
            ) : (
              transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="p-2.5 bg-zinc-800/60 border border-zinc-700/70 rounded-xl flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-white">{tx.description}</div>
                    <div className="text-[10px] text-zinc-400 font-mono">
                      {new Date(tx.timestamp).toLocaleString('pt-AO')}
                    </div>
                  </div>
                  <span
                    className={`font-mono font-bold ${
                      tx.amountKz >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {tx.amountKz >= 0 ? `+${formatKz(tx.amountKz)}` : formatKz(tx.amountKz)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-zinc-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg cursor-pointer"
          >
            Retirar Cartão
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
