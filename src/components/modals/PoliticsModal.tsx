/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { PoliticsState } from '../../game/types';
import { api } from '../../services/api';
import {
  Landmark,
  Vote,
  ScrollText,
  Users,
  CheckCircle2,
  AlertCircle,
  X,
  Crown,
} from 'lucide-react';
import { soundFx } from '../../game/audio/soundFx';

interface Props {
  characterId: string;
  initialPolitics?: PoliticsState | null;
  onPoliticsUpdated?: (pol: PoliticsState) => void;
  onClose: () => void;
}

export const PoliticsModal: React.FC<Props> = ({
  characterId,
  initialPolitics = null,
  onPoliticsUpdated,
  onClose,
}) => {
  const [politics, setPolitics] = useState<PoliticsState | null>(initialPolitics);
  const [decreeTitle, setDecreeTitle] = useState('');
  const [decreeBody, setDecreeBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const loadPolitics = useCallback(async () => {
    try {
      const res = await api.politicsGet();
      setPolitics(res.politics);
      onPoliticsUpdated?.(res.politics);
    } catch {}
  }, [onPoliticsUpdated]);

  useEffect(() => {
    loadPolitics();
  }, [loadPolitics]);

  const handleVote = async (candidateId: string) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.politicsVote(characterId, candidateId);
      soundFx.playInteract();
      setPolitics(res.politics);
      onPoliticsUpdated?.(res.politics);
      setFeedback({ type: 'ok', msg: 'Voto registado com segurança na urna oficial de Luanda!' });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao registar voto.' });
    } finally {
      setLoading(false);
    }
  };

  const handleEmitDecree = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.politicsDecision(characterId, decreeTitle, decreeBody);
      soundFx.playInteract();
      setPolitics(res.politics);
      onPoliticsUpdated?.(res.politics);
      setDecreeTitle('');
      setDecreeBody('');
      setFeedback({ type: 'ok', msg: 'Decreto Presidencial publicado no Diário Oficial da Cidade!' });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao publicar decreto.' });
    } finally {
      setLoading(false);
    }
  };

  const isPresident = Boolean(politics?.president && politics.president.characterId === characterId);
  const activeElection = politics?.activeElection || null;
  const myVotedCandidateId = activeElection?.voters?.[characterId] || null;
  const totalVotes = activeElection
    ? activeElection.candidates.reduce((acc, c) => acc + c.votes, 0)
    : 0;

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
        className="relative z-10 pointer-events-auto w-full max-w-4xl bg-zinc-900 border-2 border-amber-500/70 rounded-2xl shadow-2xl p-4 sm:p-6 text-white max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl">
              <Landmark size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">Palácio Presidencial & Sistema Político de Luanda</h2>
              <p className="text-xs text-zinc-400">
                Partidos aprovados, eleições democráticas (1 voto imutável por cidadão) e Presidência única.
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

        {feedback && (
          <div
            className={`my-3 p-2.5 rounded-xl text-xs flex items-center gap-2 border ${
              feedback.type === 'err'
                ? 'bg-red-950/60 border-red-500/60 text-red-200'
                : 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200'
            }`}
          >
            {feedback.type === 'err' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
            <span>{feedback.msg}</span>
          </div>
        )}

        {/* Presidente Atual */}
        <div className="my-4 p-4 rounded-xl bg-zinc-950 border border-amber-500/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl">
              <Crown size={22} />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">
                Presidente da República (Mandato Único Ativo)
              </div>
              {politics?.president ? (
                <>
                  <div className="text-base font-black text-white">
                    {politics.president.name} · {politics.president.partyAcronym}
                  </div>
                  <div className="text-xs text-zinc-400 tabular-nums">
                    {politics.president.partyName} · Eleito com {politics.president.votesReceived} votos
                  </div>
                </>
              ) : (
                <div className="text-sm font-bold text-zinc-300">
                  Cargo Vago — Aguardando realização/encerramento de eleições pelo Admin God
                </div>
              )}
            </div>
          </div>
          {isPresident && (
            <span className="px-2.5 py-1 bg-amber-500 text-zinc-950 text-xs font-black rounded-lg">
              És o Presidente em Exercício
            </span>
          )}
        </div>

        {/* Eleição Ativa */}
        <div className="mb-4 p-4 rounded-xl bg-zinc-800/60 border border-zinc-700 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-sm text-emerald-400">
              <Vote size={16} />
              <span>{activeElection ? activeElection.title : 'Sem Eleição Aberta no Momento'}</span>
            </div>
            {activeElection && (
              <span className="text-xs font-mono text-zinc-300 tabular-nums">
                Total de Votos: {totalVotes}
              </span>
            )}
          </div>

          {!activeElection ? (
            <p className="text-xs text-zinc-400">
              As eleições presidenciais são abertas pelo Admin God. Quando abrirem, poderás consultar os candidatos e votar aqui.
            </p>
          ) : activeElection.candidates.length === 0 ? (
            <p className="text-xs text-zinc-400">Eleição aberta. Aguardando inscrição de candidatos oficiais.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeElection.candidates.map((cand) => {
                const pct = totalVotes > 0 ? Math.round((cand.votes / totalVotes) * 100) : 0;
                const votedForThis = myVotedCandidateId === cand.id;
                return (
                  <div
                    key={cand.id}
                    className={`p-3 rounded-xl border space-y-2 ${
                      votedForThis
                        ? 'bg-emerald-950/35 border-emerald-500'
                        : 'bg-zinc-950/80 border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm text-white">{cand.name}</div>
                        <div className="text-xs font-bold" style={{ color: cand.partyColor }}>
                          Partido {cand.partyAcronym}
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <div className="text-sm font-black text-amber-400">{cand.votes} votos</div>
                        <div className="text-[10px] text-zinc-400">{pct}%</div>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-300">{cand.bio}</p>
                    <div className="w-full h-1.5 bg-zinc-800 rounded overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: cand.partyColor }}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={loading || Boolean(myVotedCandidateId)}
                      onClick={() => handleVote(cand.id)}
                      className={`w-full py-1.5 rounded-lg text-xs font-black cursor-pointer ${
                        votedForThis
                          ? 'bg-emerald-600 text-white'
                          : myVotedCandidateId
                            ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                            : 'bg-amber-500 hover:bg-amber-400 text-zinc-950'
                      }`}
                    >
                      {votedForThis
                        ? 'Voto Confirmado neste Candidato'
                        : myVotedCandidateId
                          ? 'Voto Já Utilizado'
                          : 'Votar neste Candidato (Imutável)'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Emissão de Decretos (Apenas Presidente Atual) */}
        {isPresident && (
          <form onSubmit={handleEmitDecree} className="mb-4 p-4 rounded-xl bg-amber-950/25 border border-amber-500/50 space-y-2.5 text-xs">
            <div className="font-bold text-amber-300 uppercase flex items-center gap-1.5">
              <ScrollText size={14} /> Emitir Decreto Presidencial Oficial
            </div>
            <input
              type="text"
              required
              value={decreeTitle}
              onChange={(e) => setDecreeTitle(e.target.value)}
              placeholder="Título do Decreto (ex: Incentivo ao Emprego na Baixa)"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg"
            />
            <textarea
              required
              rows={2}
              value={decreeBody}
              onChange={(e) => setDecreeBody(e.target.value)}
              placeholder="Texto oficial do decreto para todos os cidadãos de Luanda..."
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded-lg cursor-pointer"
            >
              Publicar Decreto Presidencial
            </button>
          </form>
        )}

        {/* Partidos & Decretos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 bg-zinc-800/50 border border-zinc-700 rounded-xl space-y-2">
            <div className="font-bold text-zinc-200 uppercase flex items-center gap-1.5">
              <Users size={14} className="text-cyan-400" /> Diretório de Partidos ({politics?.parties.length || 0})
            </div>
            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              {(politics?.parties || []).map((pt) => (
                <div key={pt.id} className="p-2 bg-zinc-950/80 border border-zinc-800 rounded-lg space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: pt.color }} />
                      {pt.acronym} — {pt.name}
                    </span>
                    <span className={pt.suspended ? 'text-red-400' : 'text-emerald-400'}>
                      {pt.suspended ? 'Suspenso' : 'Aprovado'}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400">{pt.ideology}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3.5 bg-zinc-800/50 border border-zinc-700 rounded-xl space-y-2">
            <div className="font-bold text-zinc-200 uppercase flex items-center gap-1.5">
              <ScrollText size={14} className="text-amber-400" /> Decretos & Histórico Eleitoral
            </div>
            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              {(politics?.decisions || []).length === 0 ? (
                <p className="text-zinc-500">Ainda não foram publicados decretos presidenciais.</p>
              ) : (
                (politics?.decisions || []).map((dec) => (
                  <div key={dec.id} className="p-2 bg-zinc-950/80 border border-zinc-800 rounded-lg space-y-0.5">
                    <div className="font-bold text-amber-300">{dec.title}</div>
                    <div className="text-zinc-300">{dec.decree}</div>
                    <div className="text-[10px] text-zinc-500">Por {dec.presidentName}</div>
                  </div>
                ))
              )}

              {(politics?.electionHistory || []).length > 0 && (
                <div className="pt-2 border-t border-zinc-700 space-y-1">
                  <div className="text-[10px] font-bold uppercase text-zinc-400">Eleições Anteriores</div>
                  {(politics?.electionHistory || []).slice(0, 5).map((eh) => (
                    <div key={eh.id} className="flex justify-between text-[11px] text-zinc-300">
                      <span>{eh.title}</span>
                      <span className="text-emerald-400 font-bold">
                        {eh.status === 'annulled' ? 'Anulada' : eh.winnerName || 'Encerrada'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

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
