/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { AccountInfo, CharacterSummary, GenderType, PlayerCustomization, SkinPreset } from '../../game/types';
import { SKIN_PRESETS } from '../../game/data/catalog';
import { api } from '../../services/api';
import { Users, Plus, Play, LogOut, Shield, AlertCircle, Sparkles } from 'lucide-react';
import { soundFx } from '../../game/audio/soundFx';

interface Props {
  account: AccountInfo;
  onSelectCharacter: (characterId: string) => void;
  onLogout: () => void;
}

export const CharacterSelectModal: React.FC<Props> = ({ account, onSelectCharacter, onLogout }) => {
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form de novo personagem
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [age, setAge] = useState(24);
  const [nationality, setNationality] = useState('Angolana');
  const [gender, setGender] = useState<GenderType>('masculino');
  const [history, setHistory] = useState('Jovem cidadão de Luanda à procura de oportunidades e respeito na cidade.');
  const [skinCategory, setSkinCategory] = useState<'all' | 'poster_faccao' | 'faa' | 'poster_civil'>('all');
  const [selectedPreset, setSelectedPreset] = useState<SkinPreset>(SKIN_PRESETS[0]);
  const [skinTone, setSkinTone] = useState(SKIN_PRESETS[0].customization.skinTone);
  const [shirtColor, setShirtColor] = useState(SKIN_PRESETS[0].customization.shirtColor);
  const [pantsColor, setPantsColor] = useState(SKIN_PRESETS[0].customization.pantsColor);
  const [hairStyle, setHairStyle] = useState<PlayerCustomization['hairStyle']>(SKIN_PRESETS[0].customization.hairStyle);
  const [hairColor, setHairColor] = useState(SKIN_PRESETS[0].customization.hairColor);

  const applyPreset = (preset: SkinPreset) => {
    soundFx.playInteract();
    setSelectedPreset(preset);
    setGender(preset.customization.gender || 'masculino');
    setSkinTone(preset.customization.skinTone);
    setShirtColor(preset.customization.shirtColor);
    setPantsColor(preset.customization.pantsColor);
    setHairStyle(preset.customization.hairStyle);
    setHairColor(preset.customization.hairColor);
  };

  const loadChars = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listCharacters();
      setCharacters(res.characters);
      if (res.characters.length === 0) setCreating(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar personagens.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChars();
  }, [loadChars]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.createCharacter({
        name,
        surname,
        age,
        nationality,
        gender,
        history,
        customization: {
          ...selectedPreset.customization,
          gender,
          skinTone,
          shirtColor,
          pantsColor,
          shoesColor: selectedPreset.customization.shoesColor || '#ffffff',
          hairStyle,
          hairColor,
          heightScale: selectedPreset.customization.heightScale || 1.0,
        },
      });
      soundFx.playCashRegister();
      onSelectCharacter(res.character.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar personagem.');
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[999] pointer-events-auto flex items-center justify-center p-4 bg-black/90 text-white overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-3xl bg-zinc-900 border-2 border-amber-500/60 rounded-2xl shadow-2xl p-6 space-y-5 max-h-[92vh] overflow-y-auto pointer-events-auto"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <Users size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
                Passaporte de Cidadãos 🇦🇴
                {account.role !== 'player' && (
                  <span className="px-2 py-0.5 text-[10px] uppercase bg-red-600/30 border border-red-500 text-red-300 rounded-full flex items-center gap-1">
                    <Shield size={11} />
                    {account.role}
                  </span>
                )}
              </h2>
              <p className="text-xs text-zinc-400">Conta: {account.email} • Máximo 4 personagens</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="px-3 py-2 bg-zinc-800 hover:bg-red-950/60 border border-zinc-700 hover:border-red-500/50 text-xs font-bold text-zinc-300 hover:text-red-300 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut size={14} />
            Terminar Sessão
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-950/60 border border-red-500/50 rounded-xl text-xs text-red-200 flex items-center gap-2">
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!creating ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {characters.map((c) => (
                <div
                  key={c.id}
                  className="p-4 bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700 hover:border-amber-500/60 rounded-2xl transition flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-base font-black text-white">
                        {c.name} {c.surname}
                      </span>
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-[10px] font-bold rounded-full">
                        Nível {c.level}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-zinc-400 space-y-0.5">
                      <div>BI: {c.idNumber} • Tel: {c.phone}</div>
                      <div>{c.age} anos • {c.nationality} • {c.gender === 'feminino' ? 'Feminino' : 'Masculino'}</div>
                    </div>
                    <div className="mt-2.5 flex items-center gap-3 text-xs font-mono">
                      <span className="text-amber-400 font-bold">Cash: {c.cashKz.toLocaleString('pt-AO')} Kz</span>
                      <span className="text-emerald-400 font-bold">Banco: {c.bankKz.toLocaleString('pt-AO')} Kz</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      soundFx.playCandongueiroHorn();
                      onSelectCharacter(c.id);
                    }}
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Play size={15} className="fill-zinc-950" />
                    Entrar em Luanda
                  </button>
                </div>
              ))}

              {characters.length < 4 && (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="p-6 border-2 border-dashed border-zinc-700 hover:border-amber-500 rounded-2xl flex flex-col items-center justify-center gap-2 text-zinc-400 hover:text-amber-400 transition min-h-[160px] cursor-pointer"
                >
                  <Plus size={28} />
                  <span className="text-sm font-bold">Criar Novo Personagem</span>
                  <span className="text-xs text-zinc-500">Nasceste na rua com 100 Kz na mão + 7.000 Kz no Banco + BI</span>
                </button>
              )}
            </div>
          </>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={15} /> Registo de Novo Cidadão em Luanda
              </h3>
              {characters.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="text-xs text-zinc-400 hover:text-white underline cursor-pointer"
                >
                  Voltar à lista
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Nome Próprio *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Kianda"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Sobrenome *</label>
                <input
                  type="text"
                  required
                  value={surname}
                  onChange={(e) => setSurname(e.target.value)}
                  placeholder="Ex: Manuel"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Idade (18–85)</label>
                <input
                  type="number"
                  min={18}
                  max={85}
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Nacionalidade</label>
                <input
                  type="text"
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(['masculino', 'feminino'] as const).map((g) => (
                <button
                  type="button"
                  key={g}
                  onClick={() => setGender(g)}
                  className={`py-2.5 rounded-xl border text-xs font-bold capitalize transition cursor-pointer ${
                    gender === g
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                  }`}
                >
                  Género: {g}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">História do Personagem (Roleplay)</label>
              <textarea
                rows={2}
                value={history}
                onChange={(e) => setHistory(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white"
              />
            </div>

            <div className="p-3 bg-zinc-800/70 rounded-xl border border-amber-500/40 space-y-3">
              <div className="flex items-center gap-3">
                <img
                  src="/assets/aistudio/images_7ac4aadf.jpeg"
                  alt="Skin Inicial Luanda RP"
                  className="w-14 h-14 rounded-xl object-cover border-2 border-amber-400 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-black text-amber-400 uppercase tracking-wider">
                    Skin Ativa: {selectedPreset.label}
                  </div>
                  <p className="text-[11px] text-zinc-300 truncate">{selectedPreset.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => applyPreset(SKIN_PRESETS[0])}
                  className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-[11px] rounded-lg shrink-0 pointer-events-auto cursor-pointer"
                >
                  Skin Inicial
                </button>
              </div>

              <div className="rounded-xl overflow-hidden border border-purple-500/40 bg-zinc-950">
                <img
                  src="/assets/aistudio/file_0000000095d881f48258d60829269af9_2f54fa86.png"
                  alt="Cartaz Luanda RP — Facções e Skins"
                  className="w-full h-28 object-cover object-center"
                />
              </div>

              <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                {[
                  { id: 'all', label: `Todas (${SKIN_PRESETS.length})` },
                  { id: 'poster_faccao', label: 'Facções do Cartaz' },
                  { id: 'faa', label: 'Militar FAA' },
                  { id: 'poster_civil', label: 'Civis Player 1–7' },
                ].map((cat) => (
                  <button
                    type="button"
                    key={cat.id}
                    onClick={() => setSkinCategory(cat.id as any)}
                    className={`px-2.5 py-1 rounded-lg border pointer-events-auto cursor-pointer ${
                      skinCategory === cat.id
                        ? 'bg-purple-600 border-purple-400 text-white'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
                {SKIN_PRESETS.filter((p) => skinCategory === 'all' || p.category === skinCategory).map((preset) => (
                  <button
                    type="button"
                    key={preset.id}
                    onClick={() => applyPreset(preset)}
                    className={`p-2 rounded-xl border text-left transition pointer-events-auto cursor-pointer ${
                      selectedPreset.id === preset.id
                        ? 'bg-amber-500/20 border-amber-400 text-white'
                        : 'bg-zinc-900/80 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-3 h-3 rounded-full shrink-0 border border-white/40"
                        style={{ backgroundColor: preset.badgeColor }}
                      />
                      <span className="text-[11px] font-bold truncate">{preset.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-zinc-800/60 rounded-xl border border-zinc-700">
              <div>
                <label className="block text-[11px] font-bold text-zinc-300 mb-1.5">Tom de Pele</label>
                <div className="flex flex-wrap gap-1.5">
                  {['#2b1810', '#4a2c17', '#6b3f20', '#9e563f', '#c68642'].map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setSkinTone(c)}
                      style={{ backgroundColor: c }}
                      className={`w-7 h-7 rounded-full border-2 cursor-pointer ${
                        skinTone === c ? 'border-amber-400 scale-110' : 'border-zinc-700'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-zinc-300 mb-1.5">Camisola Inicial</label>
                <div className="flex flex-wrap gap-1.5">
                  {['#dc2626', '#1d4ed8', '#eab308', '#16a34a', '#0f172a'].map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setShirtColor(c)}
                      style={{ backgroundColor: c }}
                      className={`w-7 h-7 rounded-lg border-2 cursor-pointer ${
                        shirtColor === c ? 'border-amber-400 scale-110' : 'border-zinc-700'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-zinc-300 mb-1.5">Calças & Dreads</label>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {['#09090b', '#1e3a8a', '#d97706'].map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setPantsColor(c)}
                      style={{ backgroundColor: c }}
                      className={`w-7 h-7 rounded-lg border-2 cursor-pointer ${
                        pantsColor === c ? 'border-amber-400 scale-110' : 'border-zinc-700'
                      }`}
                    />
                  ))}
                  {['#d4d4d8', '#171717', '#eab308'].map((hc) => (
                    <button
                      type="button"
                      key={hc}
                      onClick={() => setHairColor(hc)}
                      style={{ backgroundColor: hc }}
                      title="Cor do Cabelo"
                      className={`w-6 h-6 rounded-full border-2 cursor-pointer ${
                        hairColor === hc ? 'border-amber-400 scale-110' : 'border-zinc-700'
                      }`}
                    />
                  ))}
                  <select
                    value={hairStyle}
                    onChange={(e) => setHairStyle(e.target.value as PlayerCustomization['hairStyle'])}
                    className="ml-1 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded-lg text-[11px] text-white"
                  >
                    <option value="trancas">Tranças / Dreads</option>
                    <option value="afro">Afro</option>
                    <option value="curto">Fade</option>
                    <option value="bone">Boné</option>
                  </select>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-400 text-zinc-950 font-black text-sm uppercase tracking-wider rounded-xl transition cursor-pointer"
            >
              {loading ? 'A emitir Bilhete de Identidade...' : 'Criar Personagem e Entrar em Luanda'}
            </button>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
};
