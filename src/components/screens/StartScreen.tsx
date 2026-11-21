/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Play, User, Settings, Users, LogOut, Shield } from 'lucide-react';
import { AdminRole } from '../../game/types';
import { soundFx } from '../../game/audio/soundFx';

interface Props {
  playerName: string;
  idNumber: string;
  phone: string;
  role: AdminRole;
  onStartGame: () => void;
  onOpenIdentity: () => void;
  onOpenSettings: () => void;
  onSwitchCharacter: () => void;
  onLogout: () => void;
}

export const StartScreen: React.FC<Props> = ({
  playerName,
  idNumber,
  phone,
  role,
  onStartGame,
  onOpenIdentity,
  onOpenSettings,
  onSwitchCharacter,
  onLogout,
}) => {
  const handleStart = () => {
    soundFx.playCandongueiroHorn();
    onStartGame();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[999] pointer-events-auto flex items-center justify-center p-4 bg-gradient-to-b from-black/90 via-zinc-950/95 to-black text-white select-none"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -15 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="relative z-10 pointer-events-auto w-full max-w-xl text-center space-y-6"
      >
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-950/40 border border-amber-500/40 text-xs font-semibold text-amber-400">
          <span>REPÚBLICA DE ANGOLA</span>
          <span>🇦🇴</span>
          <span className="text-zinc-500">•</span>
          <span>CIDADE DE LUANDA</span>
          {role !== 'player' && (
            <span className="ml-1 px-2 py-0.5 rounded-full bg-red-600/30 border border-red-400/50 text-red-200 text-[10px] uppercase font-black inline-flex items-center gap-1">
              <Shield size={10} /> {role}
            </span>
          )}
        </div>

        <div className="space-y-2">
          <h1 className="text-5xl md:text-6xl font-black tracking-tighter uppercase drop-shadow-2xl">
            <span className="text-white">LUANDA</span>
            <span className="text-amber-400 ml-2">RP</span>
          </h1>
          <p className="text-sm md:text-base text-zinc-300 font-medium max-w-md mx-auto leading-relaxed">
            Mundo Aberto 3D Multiplayer • Simulação de Vida & Roleplay Angolano
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-400">
            <span>Marginal</span>
            <span>•</span>
            <span>Ilha de Luanda</span>
            <span>•</span>
            <span>Viana</span>
            <span>•</span>
            <span>Talatona</span>
            <span>•</span>
            <span>Kilamba</span>
            <span>•</span>
            <span>Aeroporto</span>
          </div>
        </div>

        <div className="p-4 bg-zinc-900/90 border border-zinc-700/80 rounded-2xl max-w-md mx-auto flex items-center justify-between text-left shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <User size={24} />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Cidadão Ativo</span>
              <div className="text-sm font-bold text-white">{playerName}</div>
              <div className="text-[11px] text-zinc-400 font-mono">
                BI: {idNumber} • Tel: {phone}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenIdentity}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-amber-400 rounded-lg border border-zinc-700 transition cursor-pointer"
          >
            Editar
          </button>
        </div>

        <div className="space-y-3 max-w-md mx-auto pt-2">
          <button
            type="button"
            onClick={handleStart}
            className="w-full py-4 px-6 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:brightness-110 text-zinc-950 font-black text-base uppercase tracking-wider rounded-2xl shadow-2xl transition flex items-center justify-center gap-3 border border-amber-300 cursor-pointer"
          >
            <Play size={22} className="fill-zinc-950" />
            <span>Entrar em Luanda (Jogar Agora)</span>
          </button>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={onOpenIdentity}
              className="py-2.5 px-3 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 hover:border-amber-500 rounded-xl text-xs font-bold text-zinc-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <User size={14} className="text-amber-400" />
              <span>Visual</span>
            </button>
            <button
              type="button"
              onClick={onSwitchCharacter}
              className="py-2.5 px-3 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 hover:border-amber-500 rounded-xl text-xs font-bold text-zinc-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Users size={14} className="text-emerald-400" />
              <span>Personagens</span>
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="py-2.5 px-3 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 hover:border-amber-500 rounded-xl text-xs font-bold text-zinc-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Settings size={14} className="text-zinc-400" />
              <span>Definições</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="py-2.5 px-3 bg-zinc-900/90 hover:bg-red-950/60 border border-zinc-700 hover:border-red-500/60 rounded-xl text-xs font-bold text-zinc-300 hover:text-red-300 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut size={14} />
              <span>Sair</span>
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-zinc-800/80 text-xs text-zinc-500 flex items-center justify-center gap-4">
          <span>PC: Teclado + Rato</span>
          <span>•</span>
          <span>Android: Touch + Joystick</span>
          <span>•</span>
          <span>Mundo Aberto 3D Autoridade Servidor</span>
        </div>
      </motion.div>
    </motion.div>
  );
};
