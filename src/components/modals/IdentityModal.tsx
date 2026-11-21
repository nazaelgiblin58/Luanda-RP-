/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { GenderType, OutfitStyle, PlayerCustomization, PlayerStats, SkinPreset } from '../../game/types';
import { SKIN_PRESETS } from '../../game/data/catalog';
import { api, CharacterRecord } from '../../services/api';
import { User, Check, X, Sparkles, Scissors, AlertCircle, Shield } from 'lucide-react';
import { soundFx } from '../../game/audio/soundFx';

interface Props {
  characterId: string;
  stats: PlayerStats;
  customization: PlayerCustomization;
  onSaved: (record: CharacterRecord) => void;
  onLiveUpdate?: (customization: PlayerCustomization) => void;
  onClose: () => void;
}

export const IdentityModal: React.FC<Props> = ({
  characterId,
  stats,
  customization,
  onSaved,
  onLiveUpdate,
  onClose,
}) => {
  const [name, setName] = useState(stats.name);
  const [surname, setSurname] = useState(stats.surname);
  const [age, setAge] = useState(stats.age || 24);
  const [nationality, setNationality] = useState(stats.nationality || 'Angolana');
  const [gender, setGender] = useState<GenderType>(stats.gender || 'masculino');
  const [history, setHistory] = useState(stats.history || '');
  const [skinTone, setSkinTone] = useState(customization.skinTone);
  const [shirtColor, setShirtColor] = useState(customization.shirtColor);
  const [pantsColor, setPantsColor] = useState(customization.pantsColor);
  const [shoesColor, setShoesColor] = useState(customization.shoesColor);
  const [hairStyle, setHairStyle] = useState<'afro' | 'trancas' | 'curto' | 'bone'>(customization.hairStyle || 'trancas');
  const [hairColor, setHairColor] = useState(customization.hairColor || '#d4d4d8');
  const [skinPresetId, setSkinPresetId] = useState(customization.skinPresetId || 'default_rubro');
  const [outfitStyle, setOutfitStyle] = useState<OutfitStyle>(customization.outfitStyle || 'jersey');
  const [vestText, setVestText] = useState(customization.vestText || '');
  const [hasMask, setHasMask] = useState(!!customization.hasMask);
  const [maskColor, setMaskColor] = useState(customization.maskColor || '#09090b');
  const [hasCap, setHasCap] = useState(!!customization.hasCap);
  const [capColor, setCapColor] = useState(customization.capColor || '#09090b');
  const [capText, setCapText] = useState(customization.capText || 'LRP');
  const [hasSunglasses, setHasSunglasses] = useState(!!customization.hasSunglasses);
  const [hasTattoos, setHasTattoos] = useState(!!customization.hasTattoos);
  const [hasChain, setHasChain] = useState(!!customization.hasChain);
  const [hasBag, setHasBag] = useState(!!customization.hasBag);
  const [skinFilter, setSkinFilter] = useState<'all' | 'poster_faccao' | 'faa' | 'poster_civil'>('all');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.style.setProperty('--selected-pants', pantsColor);
    document.documentElement.style.setProperty('--selected-shirt', shirtColor);
    document.documentElement.style.setProperty('--selected-skin', skinTone);
    document.documentElement.style.setProperty('--selected-shoes', shoesColor);
    document.documentElement.style.setProperty('--selected-hair', hairColor);
  }, [pantsColor, shirtColor, skinTone, shoesColor, hairColor]);

  const buildCurrentCustomization = (patch: Partial<PlayerCustomization> = {}): PlayerCustomization => ({
    ...customization,
    gender,
    skinTone,
    shirtColor,
    pantsColor,
    shoesColor,
    hairStyle,
    hairColor,
    skinPresetId,
    outfitStyle,
    vestText,
    hasMask,
    maskColor,
    hasCap,
    capColor,
    capText,
    hasSunglasses,
    hasTattoos,
    hasChain,
    hasBag,
    ...patch,
  });

  const emitLive = (patch: Partial<PlayerCustomization>) => {
    soundFx.playInteract();
    if (onLiveUpdate) {
      onLiveUpdate(buildCurrentCustomization(patch));
    }
  };

  const applyPreset = (preset: SkinPreset) => {
    const c = preset.customization;
    setSkinPresetId(preset.id);
    setGender(c.gender || 'masculino');
    setSkinTone(c.skinTone);
    setShirtColor(c.shirtColor);
    setPantsColor(c.pantsColor);
    setShoesColor(c.shoesColor);
    setHairStyle(c.hairStyle);
    setHairColor(c.hairColor);
    setOutfitStyle(c.outfitStyle || 'jersey');
    setVestText(c.vestText || '');
    setHasMask(!!c.hasMask);
    setMaskColor(c.maskColor || '#09090b');
    setHasCap(!!c.hasCap);
    setCapColor(c.capColor || '#09090b');
    setCapText(c.capText || '');
    setHasSunglasses(!!c.hasSunglasses);
    setHasTattoos(!!c.hasTattoos);
    setHasChain(!!c.hasChain);
    setHasBag(!!c.hasBag);
    emitLive({ ...c, skinPresetId: preset.id });
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await api.updateAppearance(characterId, {
        name: name.trim() || stats.name,
        surname: surname.trim() || stats.surname,
        age,
        nationality: nationality.trim() || 'Angolana',
        history,
        gender,
        customization: buildCurrentCustomization(),
      });
      soundFx.playCashRegister();
      onSaved(res.character);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao guardar cidadão.');
    } finally {
      setSaving(false);
    }
  };

  const hairOptions: { id: 'afro' | 'trancas' | 'curto' | 'bone'; label: string; icon: string }[] = [
    { id: 'afro', label: 'Cachos Afro', icon: '🦱' },
    { id: 'trancas', label: 'Dreadlocks / Tranças', icon: '🧑🏾‍🦱' },
    { id: 'curto', label: 'Degradê Fade', icon: '✂️' },
    { id: 'bone', label: 'Boné Luanda RP', icon: '🧢' },
  ];

  const skinPalette = [
    { label: 'Ébano Profundo', color: '#2b1810' },
    { label: 'Mogno Africano', color: '#3d2314' },
    { label: 'Castanho Luanda', color: '#4a2c17' },
    { label: 'Cobre Quente', color: '#6b3f20' },
    { label: 'Bronze Luanda (Padrão)', color: '#9e563f' },
    { label: 'Caramelo Suave', color: '#c68642' },
  ];

  const hairColorPalette = [
    { label: 'Prata / Cinza Claro', color: '#d4d4d8' },
    { label: 'Preto Clássico', color: '#171717' },
    { label: 'Castanho', color: '#78350f' },
    { label: 'Loiro Ouro', color: '#eab308' },
    { label: 'Vermelho Rubro', color: '#dc2626' },
  ];

  const pantsPalette = [
    { label: 'Azul Ganga', color: '#1e3a8a' },
    { label: 'Preto Urbano', color: '#09090b' },
    { label: 'Bege / Cáqui', color: '#d97706' },
    { label: 'Cinza Escuro', color: '#334155' },
    { label: 'Vermelho Luanda', color: '#dc2626' },
    { label: 'Verde Militar', color: '#16a34a' },
    { label: 'Branco Marginal', color: '#ffffff' },
    { label: 'Azul Celeste', color: '#0284c7' },
  ];

  const shirtPalette = [
    { label: 'Vermelho Patriota', color: '#dc2626' },
    { label: 'Azul Candongueiro', color: '#1d4ed8' },
    { label: 'Amarelo Ouro', color: '#eab308' },
    { label: 'Verde Esperança', color: '#16a34a' },
    { label: 'Preto Clássico', color: '#0f172a' },
    { label: 'Branco Elegante', color: '#ffffff' },
    { label: 'Roxo Estiloso', color: '#9333ea' },
    { label: 'Laranja Tropical', color: '#ea580c' },
  ];

  const shoesPalette = [
    { label: 'Ténis Branco', color: '#ffffff' },
    { label: 'Sapatos Pretos', color: '#09090b' },
    { label: 'Sapatilhas Vermelhas', color: '#dc2626' },
    { label: 'Botas Castanhas', color: '#78350f' },
    { label: 'Ténis Azuis', color: '#1d4ed8' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[999] pointer-events-auto flex items-center justify-center p-4 bg-black/85"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="relative z-10 pointer-events-auto w-full max-w-xl bg-zinc-900 border-2 border-amber-500/70 rounded-2xl shadow-2xl p-6 text-white max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <User size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Bilhete de Identidade & Visual
                <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-normal">
                  Luanda RP 🇦🇴
                </span>
              </h2>
              <p className="text-xs text-zinc-400">República de Angola • Tel: {stats.phone}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition pointer-events-auto cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Bilhete de Identidade Fictício */}
        <div className="my-4 p-4 rounded-xl bg-gradient-to-r from-red-950/70 via-zinc-900 to-black border border-amber-500/50 shadow-inner">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-amber-400">
              REPÚBLICA DE ANGOLA 🇦🇴
            </span>
            <span className="text-[11px] font-mono text-zinc-300">BI: {stats.idNumber}</span>
          </div>
          <div className="text-lg font-black text-white">
            {name || stats.name} {surname || stats.surname}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 mt-1">
            <span>{age} anos</span>
            <span>•</span>
            <span>{nationality}</span>
            <span>•</span>
            <span className="capitalize">{gender}</span>
            <span>•</span>
            <span className="text-cyan-400 font-mono">Tel: {stats.phone}</span>
            <span>•</span>
            <span className="text-emerald-400 font-semibold">Nível {stats.level}</span>
          </div>
        </div>

        {error && (
          <div className="mb-3 p-2.5 bg-red-950/60 border border-red-500/60 rounded-xl text-xs text-red-200 flex items-center gap-2">
            <AlertCircle size={15} className="text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Nome</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white pointer-events-auto"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Sobrenome</label>
              <input
                type="text"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white pointer-events-auto"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Idade</label>
              <input
                type="number"
                min={18}
                max={85}
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white pointer-events-auto"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Nacionalidade</label>
              <input
                type="text"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white pointer-events-auto"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(['masculino', 'feminino'] as const).map((g) => (
              <button
                type="button"
                key={g}
                onClick={() => {
                  setGender(g);
                  emitLive({ gender: g });
                }}
                className={`py-2 rounded-xl border text-xs font-bold capitalize pointer-events-auto cursor-pointer ${
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
            <label className="block text-xs font-semibold text-zinc-300 mb-1">Histórico do Personagem</label>
            <textarea
              rows={2}
              value={history}
              onChange={(e) => setHistory(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs text-white pointer-events-auto"
            />
          </div>

          {/* Galeria de Skins Cartaz + FAA + Civis */}
          <div className="p-3.5 bg-zinc-800/70 rounded-xl border border-purple-500/40 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                <Shield size={14} /> Galeria Oficial de Skins (Cartaz & FAA)
              </label>
              <button
                type="button"
                onClick={() => applyPreset(SKIN_PRESETS[0])}
                className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-300 text-[11px] font-bold rounded-lg pointer-events-auto cursor-pointer"
              >
                Restaurar Rubro-Negro
              </button>
            </div>
            <div className="rounded-xl overflow-hidden border border-purple-500/40 bg-zinc-950">
              <img
                src="/assets/aistudio/file_0000000095d881f48258d60829269af9_2f54fa86.png"
                alt="Cartaz Luanda RP — Facções e Skins"
                className="w-full h-24 object-cover object-center"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
              {[
                { id: 'all', label: `Todas (${SKIN_PRESETS.length})` },
                { id: 'poster_faccao', label: 'Facções' },
                { id: 'faa', label: 'Militar FAA' },
                { id: 'poster_civil', label: 'Civis Player 1–7' },
              ].map((cat) => (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => setSkinFilter(cat.id as any)}
                  className={`px-2.5 py-1 rounded-lg border pointer-events-auto cursor-pointer ${
                    skinFilter === cat.id
                      ? 'bg-purple-600 border-purple-400 text-white'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
              {SKIN_PRESETS.filter((p) => skinFilter === 'all' || p.category === skinFilter).map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className={`p-2 rounded-xl border text-left transition pointer-events-auto cursor-pointer ${
                    skinPresetId === preset.id
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

          {/* Acessórios & Estilo de Roupa */}
          <div className="p-3.5 bg-zinc-800/70 rounded-xl border border-zinc-700/80 space-y-3">
            <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider">
              Acessórios, Coletes & Estilo
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-[11px]">
              {([
                { id: 'jersey', label: 'Camisola' },
                { id: 'tactical_vest', label: 'Colete Tático' },
                { id: 'hoodie', label: 'Hoodie' },
                { id: 'puffer', label: 'Puffer' },
                { id: 'tank', label: 'Regata' },
                { id: 'military', label: 'Militar FAA' },
              ] as { id: OutfitStyle; label: string }[]).map((st) => (
                <button
                  type="button"
                  key={st.id}
                  onClick={() => {
                    setOutfitStyle(st.id);
                    emitLive({ outfitStyle: st.id });
                  }}
                  className={`py-1.5 px-2 rounded-lg border font-bold pointer-events-auto cursor-pointer ${
                    outfitStyle === st.id
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                { label: 'Boné', active: hasCap, toggle: () => { const v = !hasCap; setHasCap(v); emitLive({ hasCap: v }); } },
                { label: 'Máscara/Bandana', active: hasMask, toggle: () => { const v = !hasMask; setHasMask(v); emitLive({ hasMask: v }); } },
                { label: 'Óculos Escuros', active: hasSunglasses, toggle: () => { const v = !hasSunglasses; setHasSunglasses(v); emitLive({ hasSunglasses: v }); } },
                { label: 'Corrente Ouro', active: hasChain, toggle: () => { const v = !hasChain; setHasChain(v); emitLive({ hasChain: v }); } },
                { label: 'Mala Ombro', active: hasBag, toggle: () => { const v = !hasBag; setHasBag(v); emitLive({ hasBag: v }); } },
                { label: 'Tatuagens', active: hasTattoos, toggle: () => { const v = !hasTattoos; setHasTattoos(v); emitLive({ hasTattoos: v }); } },
              ].map((acc) => (
                <button
                  type="button"
                  key={acc.label}
                  onClick={acc.toggle}
                  className={`px-2.5 py-1.5 rounded-lg border font-semibold pointer-events-auto cursor-pointer ${
                    acc.active
                      ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-400'
                  }`}
                >
                  {acc.active ? '✓ ' : ''}{acc.label}
                </button>
              ))}
            </div>
            {(hasCap || outfitStyle === 'tactical_vest' || outfitStyle === 'military') && (
              <div className="grid grid-cols-2 gap-2">
                {hasCap && (
                  <input
                    type="text"
                    maxLength={8}
                    value={capText}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setCapText(val);
                      emitLive({ capText: val });
                    }}
                    placeholder="Texto do Boné (Ex: FTX, FAA)"
                    className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white pointer-events-auto"
                  />
                )}
                {(outfitStyle === 'tactical_vest' || outfitStyle === 'military') && (
                  <input
                    type="text"
                    maxLength={10}
                    value={vestText}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setVestText(val);
                      emitLive({ vestText: val });
                    }}
                    placeholder="Sigla do Colete (Ex: BMR, TCP)"
                    className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white pointer-events-auto"
                  />
                )}
              </div>
            )}
          </div>

          {/* Cabelo & Cor */}
          <div className="p-3.5 bg-zinc-800/70 rounded-xl border border-zinc-700/80 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Scissors size={14} /> Estilo & Cor do Cabelo
              </label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {hairOptions.map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => {
                    setHairStyle(opt.id);
                    emitLive({ hairStyle: opt.id });
                  }}
                  className={`p-2 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition pointer-events-auto cursor-pointer ${
                    hairStyle === opt.id
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                  }`}
                >
                  <span className="text-lg">{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11px] font-semibold text-zinc-300 mr-1">Cor do Cabelo:</span>
              {hairColorPalette.map((hc) => (
                <button
                  type="button"
                  key={hc.color}
                  title={hc.label}
                  onClick={() => {
                    setHairColor(hc.color);
                    emitLive({ hairColor: hc.color });
                  }}
                  style={{ backgroundColor: hc.color }}
                  className={`w-7 h-7 rounded-full border-2 pointer-events-auto cursor-pointer ${
                    hairColor === hc.color ? 'border-amber-400 scale-110' : 'border-zinc-700'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Calças */}
          <div className="p-3.5 bg-zinc-800/70 rounded-xl border border-zinc-700/80">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={14} /> Cor das Calças
              </label>
              <span className="text-xs text-zinc-300">
                {pantsPalette.find((p) => p.color === pantsColor)?.label || 'Personalizado'}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {pantsPalette.map((item) => (
                <button
                  type="button"
                  key={item.color}
                  onClick={() => {
                    setPantsColor(item.color);
                    emitLive({ pantsColor: item.color });
                  }}
                  style={{ backgroundColor: item.color }}
                  className={`h-10 rounded-xl flex items-center justify-center border-2 pointer-events-auto cursor-pointer ${
                    pantsColor === item.color ? 'border-amber-400 scale-105' : 'border-zinc-700'
                  }`}
                >
                  {pantsColor === item.color && (
                    <Check size={16} className={item.color === '#ffffff' ? 'text-black' : 'text-white'} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Camisa */}
          <div className="p-3.5 bg-zinc-800/70 rounded-xl border border-zinc-700/80">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Cor da Camisa</label>
              <span className="text-xs text-zinc-400">
                {shirtPalette.find((s) => s.color === shirtColor)?.label || 'Personalizado'}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {shirtPalette.map((item) => (
                <button
                  type="button"
                  key={item.color}
                  onClick={() => {
                    setShirtColor(item.color);
                    emitLive({ shirtColor: item.color });
                  }}
                  style={{ backgroundColor: item.color }}
                  className={`h-10 rounded-xl flex items-center justify-center border-2 pointer-events-auto cursor-pointer ${
                    shirtColor === item.color ? 'border-amber-400 scale-105' : 'border-zinc-700'
                  }`}
                >
                  {shirtColor === item.color && (
                    <Check size={16} className={item.color === '#ffffff' ? 'text-black' : 'text-white'} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Pele & Calçado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-zinc-800/70 rounded-xl border border-zinc-700/80">
              <label className="block text-xs font-bold text-zinc-200 uppercase mb-2">Tom de Pele</label>
              <div className="grid grid-cols-6 gap-1.5">
                {skinPalette.map((item) => (
                  <button
                    type="button"
                    key={item.color}
                    onClick={() => {
                      setSkinTone(item.color);
                      emitLive({ skinTone: item.color });
                    }}
                    style={{ backgroundColor: item.color }}
                    className={`h-8 rounded-full border-2 cursor-pointer ${
                      skinTone === item.color ? 'border-amber-400 scale-110' : 'border-zinc-700'
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="p-3 bg-zinc-800/70 rounded-xl border border-zinc-700/80">
              <label className="block text-xs font-bold text-zinc-200 uppercase mb-2">Calçado</label>
              <div className="grid grid-cols-5 gap-1.5">
                {shoesPalette.map((item) => (
                  <button
                    type="button"
                    key={item.color}
                    onClick={() => {
                      setShoesColor(item.color);
                      emitLive({ shoesColor: item.color });
                    }}
                    style={{ backgroundColor: item.color }}
                    className={`h-8 rounded-lg border-2 cursor-pointer ${
                      shoesColor === item.color ? 'border-amber-400 scale-110' : 'border-zinc-700'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 pointer-events-auto cursor-pointer"
          >
            Fechar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 rounded-xl shadow-xl pointer-events-auto cursor-pointer"
          >
            <Check size={18} />
            {saving ? 'A guardar...' : 'Guardar Cidadão'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
