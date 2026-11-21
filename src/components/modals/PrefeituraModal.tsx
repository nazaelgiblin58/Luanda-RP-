/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  GpsWaypoint,
  JobCatalog,
  PlayerStats,
  PoliticsState,
  PrefeituraAnnouncement,
} from '../../game/types';
import { JOBS_CATALOG } from '../../game/data/catalog';
import { api, CharacterRecord } from '../../services/api';
import {
  Landmark,
  Vote,
  Briefcase,
  Megaphone,
  X,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Send,
} from 'lucide-react';

interface Props {
  characterId: string;
  stats: PlayerStats;
  initialPolitics: PoliticsState | null;
  onPoliticsUpdated: (pol: PoliticsState) => void;
  onJobStarted: (job: JobCatalog, updatedChar: CharacterRecord) => void;
  onSetGpsWaypoint: (wp: GpsWaypoint) => void;
  onClose: () => void;
}

export const PrefeituraModal: React.FC<Props> = ({
  characterId,
  stats,
  initialPolitics,
  onPoliticsUpdated,
  onJobStarted,
  onSetGpsWaypoint,
  onClose,
}) => {
  const [tab, setTab] = useState<'votos' | 'empregos' | 'anuncios'>('votos');
  const [politics, setPolitics] = useState<PoliticsState | null>(initialPolitics);
  const [announcements, setAnnouncements] = useState<PrefeituraAnnouncement[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<'edital' | 'aviso' | 'emprego' | 'evento'>('aviso');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [polRes, annRes] = await Promise.all([api.politicsGet(), api.getPrefeituraAnnouncements()]);
      setPolitics(polRes.politics);
      onPoliticsUpdated(polRes.politics);
      setAnnouncements(annRes.announcements);
    } catch {}
  }, [onPoliticsUpdated]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleVote = async (candidateCharId: string) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.politicsVote(characterId, candidateCharId);
      setPolitics(res.politics);
      onPoliticsUpdated(res.politics);
      setFeedback({ type: 'ok', msg: 'Voto registado com sucesso nas urnas da Prefeitura!' });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao registar voto.' });
    } finally {
      setLoading(false);
    }
  };

  const handleStartJob = async (job: JobCatalog) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.startJob(characterId, job.id);
      onJobStarted(job, res.character);
      setFeedback({ type: 'ok', msg: `Turno iniciado em "${job.title}". Segue a baliza GPS!` });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao iniciar emprego.' });
    } finally {
      setLoading(false);
    }
  };

  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.postPrefeituraAnnouncement(characterId, {
        title: title.trim(),
        content: content.trim(),
        category,
      });
      setAnnouncements(res.announcements);
      setTitle('');
      setContent('');
      setFeedback({ type: 'ok', msg: 'Anúncio publicado no Mural da Prefeitura de Luanda!' });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao publicar anúncio.' });
    } finally {
      setLoading(false);
    }
  };

  const activeElection = politics?.activeElection || null;

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
        className="relative z-10 pointer-events-auto w-full max-w-4xl bg-zinc-900 border border-amber-500/70 rounded-2xl shadow-2xl p-4 sm:p-6 text-white max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 text-amber-300 rounded-xl">
              <Landmark size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">Prefeitura Municipal de Luanda</h2>
              <p className="text-xs text-zinc-400">
                Votação Cívica, Balcão de Empregos &amp; Editais Oficiais
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar Prefeitura"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-1.5 p-1 bg-zinc-950 border border-zinc-800 rounded-xl my-4">
          <button
            type="button"
            onClick={() => setTab('votos')}
            className={`flex-1 min-h-[42px] px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'votos' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-300 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <Vote size={15} /> Votos (Eleições)
          </button>
          <button
            type="button"
            onClick={() => setTab('empregos')}
            className={`flex-1 min-h-[42px] px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'empregos' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-300 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <Briefcase size={15} /> Empregos ({JOBS_CATALOG.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('anuncios')}
            className={`flex-1 min-h-[42px] px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'anuncios' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-300 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <Megaphone size={15} /> Anúncios ({announcements.length})
          </button>
        </div>

        {feedback && (
          <div
            className={`mb-4 p-3 rounded-xl text-xs flex items-center gap-2 border ${
              feedback.type === 'err'
                ? 'bg-red-950/60 border-red-500/60 text-red-200'
                : 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200'
            }`}
          >
            {feedback.type === 'err' ? <AlertCircle size={15} className="shrink-0" /> : <CheckCircle2 size={15} className="shrink-0" />}
            <span>{feedback.msg}</span>
          </div>
        )}

        {tab === 'votos' && (
          <div className="space-y-4">
            <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[11px] text-zinc-400 uppercase font-bold">Presidência em Exercício</div>
                <div className="text-sm font-black text-amber-300">
                  {politics?.president
                    ? `${politics.president.name} (${politics.president.partyAcronym})`
                    : 'Sem Presidente eleito no momento'}
                </div>
              </div>
              <div className="text-xs text-zinc-400">
                Estado das Urnas:{' '}
                <strong className={activeElection?.status === 'open' ? 'text-emerald-400' : 'text-amber-300'}>
                  {activeElection?.status === 'open' ? 'Votação Aberta' : 'Aguardando Abertura'}
                </strong>
              </div>
            </div>

            {activeElection && activeElection.candidates.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeElection.candidates.map((c) => {
                  const myVoteId = activeElection.voters?.[characterId] || null;
                  const votedForThis = myVoteId === c.id;
                  return (
                    <div key={c.id} className="p-3.5 bg-zinc-800/50 border border-zinc-700 rounded-xl space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-sm text-white">{c.name}</div>
                          <div className="text-xs font-bold" style={{ color: c.partyColor }}>
                            Partido {c.partyAcronym}
                          </div>
                        </div>
                        <span className="font-mono text-xs text-emerald-400 font-bold tabular-nums">
                          {c.votes} votos
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300">{c.bio}</p>
                      <button
                        type="button"
                        disabled={loading || activeElection.status !== 'open' || Boolean(myVoteId)}
                        onClick={() => handleVote(c.id)}
                        className="w-full min-h-[40px] py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 disabled:text-zinc-400 text-zinc-950 font-black text-xs rounded-lg cursor-pointer"
                      >
                        {votedForThis
                          ? 'Voto Confirmado'
                          : myVoteId
                            ? 'Voto Já Utilizado'
                            : 'Votar neste Candidato'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center bg-zinc-950/60 border border-zinc-800 rounded-xl text-xs text-zinc-400">
                Não existe eleição aberta neste momento. Quando a comissão abrir as urnas, poderás votar aqui na Prefeitura.
              </div>
            )}
          </div>
        )}

        {tab === 'empregos' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {JOBS_CATALOG.map((job) => {
              const isActive = stats.jobId === job.id;
              const firstStep = job.steps[0];
              return (
                <div
                  key={job.id}
                  className={`p-3.5 rounded-xl border space-y-2 ${
                    isActive ? 'bg-amber-950/30 border-amber-500' : 'bg-zinc-800/50 border-zinc-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-white truncate">{job.title}</div>
                      <div className="text-[11px] text-zinc-400">
                        Distrito: {job.district.toUpperCase()} · Nv.{job.minLevel}+
                      </div>
                    </div>
                    <span className="font-mono text-xs text-emerald-400 font-black shrink-0 tabular-nums">
                      +{job.basePayKz.toLocaleString('pt-AO')} Kz
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300">{job.description}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleStartJob(job)}
                      className="flex-1 min-h-[40px] py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 text-zinc-950 font-black text-xs rounded-lg cursor-pointer"
                    >
                      {isActive ? 'Trabalho Ativo' : 'Aceitar Emprego'}
                    </button>
                    {firstStep && (
                      <button
                        type="button"
                        onClick={() => {
                          onSetGpsWaypoint({ label: job.title, x: firstStep.pos[0], z: firstStep.pos[2] });
                          onClose();
                        }}
                        title="Marcar destino no GPS"
                        className="min-w-[44px] min-h-[40px] px-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-cyan-300 flex items-center justify-center cursor-pointer"
                      >
                        <MapPin size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'anuncios' && (
          <div className="space-y-4">
            <form onSubmit={handlePostAnnouncement} className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2.5">
              <div className="text-xs font-bold text-amber-300">Publicar Aviso ou Comunicado na Prefeitura</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Título do comunicado..."
                  className="sm:col-span-2 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white"
                />
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as 'edital' | 'aviso' | 'emprego' | 'evento')}
                  className="px-2.5 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white"
                >
                  <option value="aviso">Aviso Cívico</option>
                  <option value="emprego">Vaga de Emprego</option>
                  <option value="edital">Edital Municipal</option>
                  <option value="evento">Evento da Cidade</option>
                </select>
              </div>
              <textarea
                rows={2}
                required
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Detalhes do anúncio público para todos os cidadãos..."
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white"
              />
              <button
                type="submit"
                disabled={loading}
                className="min-h-[40px] px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Send size={14} /> Publicar no Mural Oficial
              </button>
            </form>

            <div className="space-y-2.5 max-h-72 overflow-y-auto">
              {announcements.map((a) => (
                <div key={a.id} className="p-3.5 bg-zinc-800/50 border border-zinc-700 rounded-xl space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-sm text-white">{a.title}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        a.isOfficial ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-zinc-900 text-zinc-300'
                      }`}
                    >
                      {a.isOfficial ? 'Oficial' : a.category}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300">{a.content}</p>
                  <div className="text-[11px] text-zinc-400">
                    Por {a.authorName} ({a.authorRole}) · {new Date(a.createdAt).toLocaleString('pt-AO')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-zinc-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg cursor-pointer"
          >
            Fechar Prefeitura
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
