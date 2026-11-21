/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { DjTrackCatalogItem, GlobalDjState, PlayerStats } from '../../game/types';
import {
  DJ_GLOBAL_COST_KZ,
  DJ_TRACKS_CATALOG,
  MUSIC_PERSONAL_COST_KZ,
} from '../../game/data/catalog';
import { api, CharacterRecord } from '../../services/api';
import {
  Disc3,
  Volume2,
  VolumeX,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  X,
  Radio,
  Headphones,
  Globe,
  Search,
} from 'lucide-react';
import { AudioPlaybackSnapshot, soundFx } from '../../game/audio/soundFx';

interface Props {
  characterId: string;
  stats: PlayerStats;
  initialDjState: GlobalDjState | null;
  serverOffsetMs: number;
  onCharacterSynced: (char: CharacterRecord) => void;
  onDjSynced: (djState: GlobalDjState, serverNow: number) => void;
  onClose: () => void;
}

const GENRE_FILTERS = ['Todos', 'Kuduro', 'Semba', 'Afrohouse', 'Kizomba', 'Amapiano', 'Hip-Hop Luanda'];

export const DjModal: React.FC<Props> = ({
  characterId,
  stats,
  initialDjState,
  serverOffsetMs,
  onCharacterSynced,
  onDjSynced,
  onClose,
}) => {
  const [djState, setDjState] = useState<GlobalDjState | null>(initialDjState);
  const [catalog, setCatalog] = useState<DjTrackCatalogItem[]>(DJ_TRACKS_CATALOG);
  const [searchResults, setSearchResults] = useState<DjTrackCatalogItem[]>(DJ_TRACKS_CATALOG);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('Todos');
  const [offsetMs, setOffsetMs] = useState(serverOffsetMs);
  const [tab, setTab] = useState<'personal' | 'global'>('personal');
  const [payWith, setPayWith] = useState<'bank' | 'cash'>('bank');
  const [audioSnap, setAudioSnap] = useState<AudioPlaybackSnapshot>(() => soundFx.getAudioSnapshot());
  const [nowTick, setNowTick] = useState(Date.now());
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const loadDj = useCallback(async () => {
    try {
      const res = await api.djGet();
      setDjState(res.djState);
      if (res.catalog?.length) {
        setCatalog(res.catalog);
      }
      setOffsetMs(res.serverNow - Date.now());
      onDjSynced(res.djState, res.serverNow);
    } catch {}
  }, [onDjSynced]);

  useEffect(() => {
    loadDj();
    const unsubAudio = soundFx.subscribeAudioSnapshot((snap) => setAudioSnap(snap));
    const t = setInterval(() => setNowTick(Date.now()), 500);
    return () => {
      clearInterval(t);
      unsubAudio();
    };
  }, [loadDj]);

  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    const localFiltered = catalog.filter((tr) => {
      const gMatch = selectedGenre === 'Todos' || tr.genre.toLowerCase() === selectedGenre.toLowerCase();
      if (!gMatch) return false;
      if (!q) return true;
      return (
        tr.title.toLowerCase().includes(q) ||
        tr.artist.toLowerCase().includes(q) ||
        tr.genre.toLowerCase().includes(q)
      );
    });
    setSearchResults(localFiltered);

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.searchMusic(searchQuery, selectedGenre === 'Todos' ? '' : selectedGenre);
        if (!cancelled && Array.isArray(res.tracks)) {
          setSearchResults(res.tracks);
        }
      } catch {}
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, selectedGenre, catalog]);

  const handleUnlockAudio = async () => {
    const ok = await soundFx.unlockDjAudio();
    if (ok && djState && audioSnap.mode === 'global') {
      soundFx.syncGlobalDjTrack(djState, Date.now() + offsetMs);
    }
  };

  const handlePlayPersonalPaid = async (track: DjTrackCatalogItem) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.playMusic(characterId, track.id, 'personal', payWith);
      onCharacterSynced(res.character);
      await soundFx.playPaidPersonalTrack(track.id);
      setFeedback({
        type: 'ok',
        msg: `Faixa "${track.title}" desbloqueada e a tocar no teu leitor (${MUSIC_PERSONAL_COST_KZ.toLocaleString('pt-AO')} Kz)!`,
      });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Saldo insuficiente para reproduzir música.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchToGlobal = () => {
    soundFx.switchToGlobalDjMode();
    if (djState) {
      soundFx.syncGlobalDjTrack(djState, Date.now() + offsetMs);
    }
    setFeedback({
      type: 'ok',
      msg: 'Áudio sincronizado novamente com a Cabine DJ Global da cidade.',
    });
  };

  const handlePlayGlobalTrack = async (track: DjTrackCatalogItem) => {
    setLoading(true);
    setFeedback(null);
    try {
      await handleUnlockAudio();
      soundFx.switchToGlobalDjMode();
      const res = await api.playMusic(characterId, track.id, 'global', payWith);
      if (res.djState && typeof res.serverNow === 'number') {
        setDjState(res.djState);
        setOffsetMs(res.serverNow - Date.now());
        onDjSynced(res.djState, res.serverNow);
      }
      onCharacterSynced(res.character);
      setFeedback({
        type: 'ok',
        msg: `"${track.title}" transmitida globalmente para toda Luanda (${DJ_GLOBAL_COST_KZ.toLocaleString('pt-AO')} Kz)!`,
      });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao contratar DJ Global.' });
    } finally {
      setLoading(false);
    }
  };

  const syncedNow = nowTick + offsetMs;
  const activeGlobal = djState?.currentTrack && djState.currentTrack.endsAt > syncedNow ? djState.currentTrack : null;
  const totalMs = activeGlobal ? Math.max(1000, activeGlobal.endsAt - activeGlobal.startedAt) : 1000;
  const elapsedMs = activeGlobal ? Math.max(0, Math.min(totalMs, syncedNow - activeGlobal.startedAt)) : 0;
  const remainingSec = activeGlobal ? Math.max(0, Math.ceil((activeGlobal.endsAt - syncedNow) / 1000)) : 0;
  const progressPct = activeGlobal ? Math.round((elapsedMs / totalMs) * 100) : 0;
  const isPersonalMode = audioSnap.mode === 'personal' && !!audioSnap.personalTrack;

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
        className="relative z-10 pointer-events-auto w-full max-w-3xl bg-zinc-900 border border-purple-500/70 rounded-2xl shadow-2xl p-4 sm:p-6 text-white max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-purple-500/20 text-purple-300 rounded-xl">
              <Disc3 size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">Sistema Musical &amp; DJ de Luanda</h2>
              <p className="text-xs text-zinc-400 tabular-nums">
                Pesquisa e paga para ouvir nos teus auscultadores ({MUSIC_PERSONAL_COST_KZ.toLocaleString('pt-AO')} Kz) ou na cidade ({DJ_GLOBAL_COST_KZ.toLocaleString('pt-AO')} Kz)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar Cabine DJ"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Estado Ao Vivo */}
        <div className="my-4 p-4 rounded-xl bg-zinc-950 border border-purple-500/40 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {isPersonalMode ? (
                <Headphones size={18} className="text-cyan-400 shrink-0" />
              ) : (
                <Radio size={18} className={activeGlobal ? 'text-emerald-400 shrink-0' : 'text-zinc-500 shrink-0'} />
              )}
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-purple-300">
                  {isPersonalMode ? 'A Ouvir Agora · Leitor Pessoal Pago' : 'A Ouvir Agora · DJ Global Sincronizado'}
                </div>
                {isPersonalMode && audioSnap.personalTrack ? (
                  <div className="text-sm font-black text-white truncate">
                    {audioSnap.personalTrack.title} — {audioSnap.personalTrack.artist}
                    <span className="text-zinc-400 font-normal"> · {audioSnap.personalTrack.genre}</span>
                  </div>
                ) : activeGlobal ? (
                  <div className="text-sm font-black text-white truncate">
                    {activeGlobal.title} — {activeGlobal.artist}
                    <span className="text-zinc-400 font-normal"> · {activeGlobal.bpm} BPM</span>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-400">Cabine global em silêncio — pesquisa e escolhe uma música abaixo.</div>
                )}
              </div>
            </div>

            {isPersonalMode ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => soundFx.togglePersonalPause()}
                  className="min-h-[40px] px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  {audioSnap.personalTrack?.paused ? <Play size={14} /> : <Pause size={14} />}
                  <span>{audioSnap.personalTrack?.paused ? 'Retomar' : 'Pausar'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSwitchToGlobal}
                  className="min-h-[40px] px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Globe size={14} />
                  <span>Voltar ao DJ Global</span>
                </button>
              </div>
            ) : (
              activeGlobal && (
                <div className="text-right text-xs font-mono tabular-nums shrink-0">
                  <div className="text-emerald-400 font-bold">Restante: {remainingSec}s</div>
                  <div className="text-zinc-400">DJ: {activeGlobal.paidByName}</div>
                </div>
              )
            )}
          </div>

          {!isPersonalMode && activeGlobal && (
            <div className="w-full h-2 bg-zinc-800 rounded overflow-hidden">
              <div className="h-full bg-purple-500 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800 text-xs">
            <div className="flex items-center gap-2">
              {!audioSnap.djUnlocked ? (
                <button
                  type="button"
                  onClick={handleUnlockAudio}
                  className="min-h-[40px] px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Volume2 size={14} /> Ativar Áudio
                </button>
              ) : (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <Volume2 size={14} /> Áudio Ativo
                </span>
              )}

              <button
                type="button"
                onClick={() => soundFx.setDjMuted(!audioSnap.djMuted)}
                className="min-h-[40px] px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {audioSnap.djMuted ? <VolumeX size={14} className="text-red-400" /> : <Volume2 size={14} />}
                <span>{audioSnap.djMuted ? 'Silenciado' : 'Som Ligado'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2 tabular-nums">
              <span className="text-zinc-400">Volume:</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={audioSnap.djVolume}
                onChange={(e) => soundFx.setDjVolume(Number(e.target.value))}
                className="w-28 accent-purple-500"
              />
              <span className="font-mono text-zinc-300 w-9 text-right">{Math.round(audioSnap.djVolume * 100)}%</span>
            </div>
          </div>
        </div>

        {/* Método de Pagamento & Saldos */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs bg-zinc-800/50 p-3 rounded-xl border border-zinc-700">
          <div className="tabular-nums">
            Banco BFA: <strong className="text-emerald-400">{stats.bankKz.toLocaleString('pt-AO')} Kz</strong> ·
            Mão: <strong className="text-amber-400">{stats.cashKz.toLocaleString('pt-AO')} Kz</strong>
          </div>
          <div className="flex items-center gap-1.5">
            <span>Pagar com:</span>
            <button
              type="button"
              onClick={() => setPayWith('bank')}
              className={`min-h-[38px] px-3 py-1 rounded font-bold cursor-pointer ${
                payWith === 'bank' ? 'bg-emerald-600 text-white' : 'bg-zinc-900 text-zinc-400'
              }`}
            >
              Banco BFA
            </button>
            <button
              type="button"
              onClick={() => setPayWith('cash')}
              className={`min-h-[38px] px-3 py-1 rounded font-bold cursor-pointer ${
                payWith === 'cash' ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-900 text-zinc-400'
              }`}
            >
              Dinheiro Vivo
            </button>
          </div>
        </div>

        {/* Separadores */}
        <div className="flex gap-1.5 p-1 bg-zinc-950 border border-zinc-800 rounded-xl mb-4">
          <button
            type="button"
            onClick={() => setTab('personal')}
            className={`flex-1 min-h-[42px] px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
              tab === 'personal' ? 'bg-cyan-600 text-white' : 'text-zinc-300 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <Headphones size={15} />
            <span>Ouvir Só Eu ({MUSIC_PERSONAL_COST_KZ.toLocaleString('pt-AO')} Kz)</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('global')}
            className={`flex-1 min-h-[42px] px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
              tab === 'global' ? 'bg-purple-600 text-white' : 'text-zinc-300 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <Globe size={15} />
            <span>DJ Global da Cidade ({DJ_GLOBAL_COST_KZ.toLocaleString('pt-AO')} Kz)</span>
          </button>
        </div>

        {/* Pesquisa & Filtros por Género */}
        <div className="mb-4 space-y-2.5">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar música, artista ou estilo (ex: Kuduro, Semba, Amapiano, Gerilson)..."
              className="w-full pl-9 pr-3 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-xs text-white focus:outline-none focus:border-purple-400"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {GENRE_FILTERS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setSelectedGenre(g)}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                  selectedGenre === g
                    ? 'bg-purple-600 border-purple-400 text-white'
                    : 'bg-zinc-950 border-zinc-700 text-zinc-300 hover:text-white'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
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

        {/* Lista de Resultados Pesquisados */}
        {searchResults.length === 0 ? (
          <div className="p-6 text-center bg-zinc-950/70 border border-zinc-800 rounded-xl text-xs text-zinc-400">
            Nenhuma música encontrada para "{searchQuery}". Tenta outro nome ou género musical.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {searchResults.map((tr) => {
              const isPlayingPersonal = isPersonalMode && audioSnap.personalTrack?.trackId === tr.id;
              const isPlayingGlobal = !isPersonalMode && activeGlobal?.trackId === tr.id;
              const isActive = tab === 'personal' ? isPlayingPersonal : isPlayingGlobal;
              const cost = tab === 'personal' ? MUSIC_PERSONAL_COST_KZ : DJ_GLOBAL_COST_KZ;

              return (
                <div
                  key={tr.id}
                  className={`p-3.5 rounded-xl border space-y-2 ${
                    isActive ? 'bg-purple-950/35 border-purple-500' : 'bg-zinc-800/60 border-zinc-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-white truncate">{tr.title}</div>
                      <div className="text-xs text-zinc-400 truncate">
                        {tr.artist} · {tr.genre}
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-amber-400 font-bold shrink-0 tabular-nums">
                      {cost.toLocaleString('pt-AO')} Kz
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 tabular-nums">
                    {tr.bpm} BPM · Duração {tr.durationSec}s
                  </div>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => (tab === 'personal' ? handlePlayPersonalPaid(tr) : handlePlayGlobalTrack(tr))}
                    className={`w-full min-h-[40px] py-2 text-white font-black text-xs rounded-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:bg-zinc-700 ${
                      tab === 'personal'
                        ? 'bg-cyan-600 hover:bg-cyan-500'
                        : 'bg-purple-600 hover:bg-purple-500'
                    }`}
                  >
                    <Play size={13} />
                    {tab === 'personal'
                      ? isPlayingPersonal
                        ? `A Tocar (${MUSIC_PERSONAL_COST_KZ.toLocaleString('pt-AO')} Kz)`
                        : `Pagar & Ouvir (${MUSIC_PERSONAL_COST_KZ.toLocaleString('pt-AO')} Kz)`
                      : `Transmitir Globalmente (${DJ_GLOBAL_COST_KZ.toLocaleString('pt-AO')} Kz)`}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {(djState?.history || []).length > 0 && (
          <div className="mt-5 p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-1.5">
            <div className="text-xs font-bold text-purple-300">Histórico DJ Global</div>
            <div className="space-y-1 max-h-28 overflow-y-auto text-[11px]">
              {(djState?.history || []).slice(0, 8).map((h) => (
                <div key={h.id} className="flex justify-between gap-2 text-zinc-300 border-b border-zinc-800/60 pb-1">
                  <span className="truncate">
                    <strong>{h.title}</strong> ({h.artist})
                  </span>
                  <span className="text-zinc-400 shrink-0">por {h.paidByName}</span>
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
            Fechar Cabine DJ
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
