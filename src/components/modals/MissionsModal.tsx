/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { MissionProgress } from '../../game/types';
import { api, CharacterRecord } from '../../services/api';
import { Trophy, Target, Flag, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { soundFx } from '../../game/audio/soundFx';
import { useFirebase } from '../../contexts/FirebaseContext';
import { fetchFirestoreLeaderboard } from '../../services/firestoreSync';

interface Props {
  characterId: string;
  missions: MissionProgress[];
  achievements: string[];
  onCharacterSynced: (char: CharacterRecord) => void;
  onClose: () => void;
}

export const MissionsModal: React.FC<Props> = ({
  characterId,
  missions,
  achievements,
  onCharacterSynced,
  onClose,
}) => {
  const { firebaseUser } = useFirebase();
  const [tab, setTab] = useState<'missions' | 'ranking' | 'report'>('missions');
  const [leaderboard, setLeaderboard] = useState<{
    id: string;
    name: string;
    level: number;
    netWorthKz: number;
    jobsCompleted: number;
    factionId: string | null;
  }[]>([]);
  const [targetName, setTargetName] = useState('');
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const loadLeaderboard = useCallback(async () => {
    try {
      const res = await api.getLeaderboard();
      let combined = [...res.leaderboard];
      if (firebaseUser) {
        try {
          const cloudRows = await fetchFirestoreLeaderboard(15);
          const seen = new Set(combined.map((r) => r.id));
          for (const row of cloudRows) {
            if (!seen.has(row.id)) {
              combined.push(row);
              seen.add(row.id);
            }
          }
          combined = combined.sort((a, b) => b.netWorthKz - a.netWorthKz).slice(0, 15);
        } catch {}
      }
      setLeaderboard(combined);
    } catch {}
  }, [firebaseUser]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const handleClaim = async (missionId: string) => {
    try {
      const res = await api.claimMission(characterId, missionId);
      soundFx.playCashRegister();
      onCharacterSynced(res.character);
      setFeedback({ type: 'ok', msg: 'Recompensa da missão depositada no teu Banco BFA!' });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao resgatar.' });
    }
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.sendReport(characterId, targetName, reason);
      setTargetName('');
      setReason('');
      soundFx.playInteract();
      setFeedback({ type: 'ok', msg: 'Denúncia enviada para a Moderação / Admin!' });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao enviar reporte.' });
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
        className="relative z-10 pointer-events-auto w-full max-w-2xl bg-zinc-900 border-2 border-amber-500/70 rounded-2xl shadow-2xl p-6 text-white max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <Trophy size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Missões, Ranking de Luanda & Suporte</h2>
              <p className="text-xs text-zinc-400">Conquistas desbloqueadas: {achievements.length}</p>
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

        <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-950 rounded-xl border border-zinc-800 text-xs font-bold my-4">
          <button
            type="button"
            onClick={() => setTab('missions')}
            className={`py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'missions' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400'
            }`}
          >
            <Target size={14} /> Missões
          </button>
          <button
            type="button"
            onClick={() => setTab('ranking')}
            className={`py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'ranking' ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-400'
            }`}
          >
            <Trophy size={14} /> Ranking Kz
          </button>
          <button
            type="button"
            onClick={() => setTab('report')}
            className={`py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'report' ? 'bg-red-600 text-white' : 'text-zinc-400'
            }`}
          >
            <Flag size={14} /> Reportar RP
          </button>
        </div>

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

        {tab === 'missions' && (
          <div className="space-y-3">
            {missions.map((m) => {
              const ready = !m.claimed && m.progress >= m.target;
              return (
                <div key={m.id} className="p-3.5 bg-zinc-800/60 border border-zinc-700 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold mr-2">
                        {m.type === 'daily' ? 'Diária' : 'Semanal'}
                      </span>
                      <strong className="text-sm text-white">{m.title}</strong>
                    </div>
                    <span className="text-xs font-mono text-emerald-400 font-bold">
                      +{m.rewardKz.toLocaleString('pt-AO')} Kz • +{m.rewardXp} XP
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">{m.description}</p>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 h-2 bg-zinc-900 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500"
                        style={{ width: `${Math.min(100, (m.progress / m.target) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-zinc-300">
                      {m.progress}/{m.target}
                    </span>
                    <button
                      type="button"
                      disabled={!ready}
                      onClick={() => handleClaim(m.id)}
                      className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 font-bold text-xs rounded-lg cursor-pointer"
                    >
                      {m.claimed ? 'Resgatada' : ready ? 'Resgatar' : 'Em curso'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'ranking' && (
          <div className="space-y-2">
            {leaderboard.map((entry, idx) => (
              <div
                key={entry.id}
                className="p-3 bg-zinc-800/60 border border-zinc-700 rounded-xl flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-black flex items-center justify-center">
                    #{idx + 1}
                  </span>
                  <div>
                    <strong className="text-sm text-white">{entry.name}</strong>
                    <div className="text-[11px] text-zinc-400">
                      Nível {entry.level} • {entry.jobsCompleted} turnos concluídos
                    </div>
                  </div>
                </div>
                <span className="font-mono font-bold text-emerald-400">
                  {entry.netWorthKz.toLocaleString('pt-AO')} Kz
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === 'report' && (
          <form onSubmit={handleReport} className="space-y-3">
            <input
              type="text"
              required
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              placeholder="Nome do Cidadão ou Assunto"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs"
            />
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreve o incidente ou quebra de regras RP..."
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs"
            />
            <button
              type="submit"
              className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl cursor-pointer"
            >
              Enviar Reporte à Administração
            </button>
          </form>
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
