/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { ClassifiedAd, GpsWaypoint, PlayerStats, SmsMessage } from '../../game/types';
import { api, CharacterRecord } from '../../services/api';
import {
  Smartphone,
  MessageCircle,
  Megaphone,
  PhoneCall,
  Send,
  Navigation,
  CreditCard,
  Briefcase,
  X,
  CheckCircle2,
  AlertCircle,
  ArrowRightLeft,
} from 'lucide-react';
import { soundFx } from '../../game/audio/soundFx';

interface Props {
  characterId: string;
  stats: PlayerStats;
  playerPos: { x: number; z: number };
  onCharacterSynced?: (char: CharacterRecord) => void;
  onOpenBank: () => void;
  onOpenJobs: () => void;
  onOpenMap: () => void;
  onSetGpsWaypoint: (wp: GpsWaypoint) => void;
  onClose: () => void;
}

export const PhoneModal: React.FC<Props> = ({
  characterId,
  stats,
  playerPos,
  onCharacterSynced,
  onOpenBank,
  onOpenJobs,
  onOpenMap,
  onSetGpsWaypoint,
  onClose,
}) => {
  const [app, setApp] = useState<'home' | 'whatsapp' | 'multicaixa' | 'ads' | 'sos'>('home');
  const [smsList, setSmsList] = useState<SmsMessage[]>([]);
  const [ads, setAds] = useState<ClassifiedAd[]>([]);
  const [contacts, setContacts] = useState<{ name: string; phone: string }[]>([]);
  const [toPhone, setToPhone] = useState('');
  const [smsText, setSmsText] = useState('');
  const [mcxTarget, setMcxTarget] = useState('');
  const [mcxAmount, setMcxAmount] = useState(1000);
  const [mcxLoading, setMcxLoading] = useState(false);
  const [adTitle, setAdTitle] = useState('');
  const [adDesc, setAdDesc] = useState('');
  const [adPrice, setAdPrice] = useState(5000);
  const [sosMsg, setSosMsg] = useState('Preciso de apoio urgente na minha localização!');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const loadPhone = useCallback(async () => {
    try {
      const res = await api.getPhoneData(characterId);
      setSmsList(res.sms);
      setAds(res.ads);
      setContacts(res.contacts);
      if (!toPhone && res.contacts[0]) setToPhone(res.contacts[0].phone);
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao sincronizar dados do telemóvel.' });
    }
  }, [characterId, toPhone]);

  useEffect(() => {
    loadPhone();
  }, [loadPhone]);

  const handleSendWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toPhone || !smsText.trim()) return;
    try {
      await api.sendSms(characterId, toPhone, smsText);
      soundFx.playPhoneRing();
      setSmsText('');
      setFeedback({ type: 'ok', msg: `Mensagem WhatsApp enviada para ${toPhone}!` });
      loadPhone();
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao enviar mensagem.' });
    }
  };

  const handleMulticaixaTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mcxTarget.trim() || mcxAmount <= 0) return;
    setMcxLoading(true);
    setFeedback(null);
    try {
      const res = await api.bankAction(characterId, 'transfer', Math.floor(mcxAmount), mcxTarget.trim());
      soundFx.playAtmCash();
      onCharacterSynced?.(res.character);
      setMcxTarget('');
      setFeedback({
        type: 'ok',
        msg: `Transferência Multicaixa Express de ${Math.floor(mcxAmount).toLocaleString('pt-AO')} Kz enviada com sucesso!`,
      });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Falha na transferência Multicaixa.' });
    } finally {
      setMcxLoading(false);
    }
  };

  const handlePostAd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.postAd(characterId, adTitle, adDesc, adPrice);
      setAds(res.ads);
      setAdTitle('');
      setAdDesc('');
      soundFx.playInteract();
      setFeedback({ type: 'ok', msg: 'Anúncio publicado nos Classificados de Luanda!' });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao publicar anúncio.' });
    }
  };

  const handleEmergency = async (service: 'policia' | 'medico') => {
    try {
      await api.callEmergency(characterId, service, sosMsg, playerPos.x, playerPos.z);
      soundFx.playSiren();
      setFeedback({
        type: 'ok',
        msg:
          service === 'policia'
            ? 'Alerta enviado ao Comando 113 (Polícia Nacional)!'
            : 'Pedido enviado às Ambulâncias 112 (INEMA)!',
      });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Falha na chamada.' });
    }
  };

  const conversationMsgs = toPhone
    ? smsList.filter((m) => m.toPhone === toPhone || m.fromPhone === toPhone)
    : smsList;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[999] pointer-events-auto flex items-center justify-center p-4 bg-black/80"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative z-10 pointer-events-auto w-full max-w-sm bg-zinc-950 border-4 border-zinc-700 rounded-[2rem] shadow-2xl p-5 text-white max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2 text-xs">
            <Smartphone size={16} className="text-cyan-400" />
            <span className="font-bold">Luanda 5G</span>
            <span className="font-mono text-zinc-400">{stats.phone}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar Telemóvel"
            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {feedback && (
          <div
            className={`mb-3 p-2.5 rounded-xl text-xs flex items-center gap-2 border ${
              feedback.type === 'err'
                ? 'bg-red-950/60 border-red-500/60 text-red-200'
                : 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200'
            }`}
          >
            {feedback.type === 'err' ? <AlertCircle size={14} className="shrink-0" /> : <CheckCircle2 size={14} className="shrink-0" />}
            <span>{feedback.msg}</span>
          </div>
        )}

        {app === 'home' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setApp('multicaixa')}
              className="w-full text-left p-3.5 bg-gradient-to-br from-amber-500/20 to-red-900/30 border border-amber-500/50 hover:border-amber-400 rounded-2xl cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase font-bold text-amber-300">Multicaixa Express • Tocar p/ Transferir</div>
                <ArrowRightLeft size={14} className="text-amber-300" />
              </div>
              <div className="text-xl font-black text-emerald-400 font-mono tabular-nums mt-0.5">
                {stats.bankKz.toLocaleString('pt-AO')} Kz
              </div>
              <div className="text-[11px] text-zinc-300 mt-1 tabular-nums">
                {stats.name} {stats.surname} • Mão: {stats.cashKz.toLocaleString('pt-AO')} Kz
              </div>
            </button>

            <div className="grid grid-cols-3 gap-2.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setApp('whatsapp')}
                className="min-h-[72px] p-3 bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-600/60 rounded-2xl flex flex-col items-center justify-center gap-1.5 cursor-pointer"
              >
                <MessageCircle size={22} className="text-emerald-400" />
                <span>WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={() => setApp('multicaixa')}
                className="min-h-[72px] p-3 bg-amber-950/40 hover:bg-amber-900/40 border border-amber-500/60 rounded-2xl flex flex-col items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowRightLeft size={22} className="text-amber-400" />
                <span className="text-[11px] text-center leading-tight">Multicaixa</span>
              </button>
              <button
                type="button"
                onClick={() => setApp('ads')}
                className="min-h-[72px] p-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl flex flex-col items-center justify-center gap-1.5 cursor-pointer"
              >
                <Megaphone size={22} className="text-amber-400" />
                <span>Anúncios</span>
              </button>
              <button
                type="button"
                onClick={() => setApp('sos')}
                className="min-h-[72px] p-3 bg-red-950/60 hover:bg-red-900/60 border border-red-700/60 rounded-2xl flex flex-col items-center justify-center gap-1.5 cursor-pointer"
              >
                <PhoneCall size={22} className="text-red-400" />
                <span>112 / 113</span>
              </button>
              <button
                type="button"
                onClick={() => { onClose(); onOpenJobs(); }}
                className="min-h-[72px] p-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl flex flex-col items-center justify-center gap-1.5 cursor-pointer"
              >
                <Briefcase size={22} className="text-purple-400" />
                <span>Empregos</span>
              </button>
              <button
                type="button"
                onClick={() => { onClose(); onOpenMap(); }}
                className="min-h-[72px] p-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl flex flex-col items-center justify-center gap-1.5 cursor-pointer"
              >
                <Navigation size={22} className="text-blue-400" />
                <span>Mapa GPS</span>
              </button>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-zinc-500">Atalhos GPS &amp; Banco</span>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => { onSetGpsWaypoint({ label: 'Prefeitura de Luanda', x: 26, z: 108 }); onClose(); }}
                  className="min-h-[38px] py-1.5 px-2 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-cyan-500 cursor-pointer"
                >
                  📍 Prefeitura
                </button>
                <button
                  type="button"
                  onClick={() => { onClose(); onOpenBank(); }}
                  className="min-h-[38px] py-1.5 px-2 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-emerald-500 cursor-pointer flex items-center justify-center gap-1"
                >
                  <CreditCard size={12} className="text-emerald-400" /> App BFA
                </button>
              </div>
            </div>
          </div>
        )}

        {app === 'whatsapp' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setApp('home')} className="text-xs text-emerald-400 font-bold cursor-pointer">
                ← Voltar
              </button>
              <span className="text-xs font-black text-emerald-400 flex items-center gap-1">
                <MessageCircle size={14} /> WhatsApp Luanda
              </span>
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {contacts.map((c) => (
                <button
                  key={c.phone}
                  type="button"
                  onClick={() => setToPhone(c.phone)}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold shrink-0 border cursor-pointer ${
                    toPhone === c.phone
                      ? 'bg-emerald-600 border-emerald-400 text-white'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>

            <div className="p-2.5 bg-zinc-900/90 border border-zinc-800 rounded-2xl space-y-2 h-56 overflow-y-auto">
              {conversationMsgs.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-10">Sem mensagens nesta conversa. Envia o primeiro olá!</p>
              ) : (
                conversationMsgs.map((m) => {
                  const isMine = m.fromPhone === stats.phone;
                  return (
                    <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[82%] px-3 py-1.5 rounded-2xl text-xs ${
                          isMine
                            ? 'bg-emerald-700 text-white rounded-br-sm'
                            : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                        }`}
                      >
                        {!isMine && (
                          <div className="text-[10px] font-bold text-emerald-300 mb-0.5">
                            {m.fromName} ({m.fromPhone})
                          </div>
                        )}
                        <p>{m.text}</p>
                        <div className="text-[9px] text-white/60 text-right mt-0.5 tabular-nums">
                          {new Date(m.timestamp).toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={handleSendWhatsApp} className="space-y-1.5">
              <input
                type="text"
                value={toPhone}
                onChange={(e) => setToPhone(e.target.value)}
                placeholder="Nº Telefone destino (Ex: 923...)"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-white"
              />
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={smsText}
                  onChange={(e) => setSmsText(e.target.value)}
                  placeholder="Mensagem WhatsApp / SMS..."
                  className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs text-white"
                />
                <button type="submit" className="min-w-[44px] min-h-[40px] px-3 bg-emerald-500 text-zinc-950 font-bold rounded-xl cursor-pointer flex items-center justify-center">
                  <Send size={15} />
                </button>
              </div>
            </form>
          </div>
        )}

        {app === 'multicaixa' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setApp('home')} className="text-xs text-amber-400 font-bold cursor-pointer">
                ← Voltar
              </button>
              <span className="text-xs font-black text-amber-400">MULTICAIXA EXPRESS</span>
            </div>

            <div className="p-3 bg-gradient-to-br from-amber-500/20 to-red-900/30 border border-amber-500/40 rounded-2xl tabular-nums">
              <div className="text-[10px] uppercase text-zinc-300">Saldo Disponível (Banco BFA)</div>
              <div className="text-xl font-black text-emerald-400 font-mono">
                {stats.bankKz.toLocaleString('pt-AO')} Kz
              </div>
            </div>

            <form onSubmit={handleMulticaixaTransfer} className="space-y-2.5 p-3 bg-zinc-900 border border-zinc-800 rounded-2xl">
              <label className="block text-[11px] font-bold text-zinc-300">
                Destinatário (Nome, Nº Telefone ou ID do Jogador)
              </label>
              <input
                type="text"
                required
                value={mcxTarget}
                onChange={(e) => setMcxTarget(e.target.value)}
                placeholder="Ex: Manuel António ou 923..."
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-xl text-xs text-white"
              />
              {contacts.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setMcxTarget(e.target.value);
                  }}
                  className="w-full px-2.5 py-2 bg-zinc-950 border border-zinc-700 rounded-xl text-xs text-zinc-200"
                >
                  <option value="">Escolher contacto rápido...</option>
                  {contacts.map((c) => (
                    <option key={c.phone} value={c.phone}>
                      {c.name} ({c.phone})
                    </option>
                  ))}
                </select>
              )}

              <label className="block text-[11px] font-bold text-zinc-300">Valor em Kwanzas (Kz)</label>
              <input
                type="number"
                min={1}
                required
                value={mcxAmount}
                onChange={(e) => setMcxAmount(Number(e.target.value))}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-xl text-xs font-mono text-white"
              />

              <div className="grid grid-cols-4 gap-1.5">
                {[1000, 5000, 10000, 25000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMcxAmount(v)}
                    className="py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-[10px] font-mono font-bold text-amber-300 cursor-pointer"
                  >
                    {v >= 1000 ? `${v / 1000}k` : v}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={mcxLoading}
                className="w-full min-h-[42px] py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 text-zinc-950 font-black text-xs rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
              >
                <ArrowRightLeft size={14} /> Transferir Imediatamente
              </button>
            </form>
          </div>
        )}

        {app === 'ads' && (
          <div className="space-y-3">
            <button type="button" onClick={() => setApp('home')} className="text-xs text-amber-400 underline cursor-pointer">
              ← Voltar ao Menu
            </button>
            <form onSubmit={handlePostAd} className="space-y-2 p-2.5 bg-zinc-900 rounded-xl border border-zinc-800">
              <input
                type="text"
                required
                value={adTitle}
                onChange={(e) => setAdTitle(e.target.value)}
                placeholder="Título do Anúncio (Ex: Vendo Hilux)"
                className="w-full px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs"
              />
              <input
                type="text"
                required
                value={adDesc}
                onChange={(e) => setAdDesc(e.target.value)}
                placeholder="Descrição rápida..."
                className="w-full px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  value={adPrice}
                  onChange={(e) => setAdPrice(Number(e.target.value))}
                  className="w-1/2 px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs font-mono"
                />
                <button type="submit" className="w-1/2 py-1.5 bg-amber-500 text-zinc-950 font-bold text-xs rounded-lg cursor-pointer">
                  Publicar Anúncio
                </button>
              </div>
            </form>
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {ads.map((a) => (
                <div key={a.id} className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs">
                  <div className="flex justify-between font-bold">
                    <span className="text-white">{a.title}</span>
                    <span className="text-emerald-400 font-mono">{a.priceKz.toLocaleString('pt-AO')} Kz</span>
                  </div>
                  <p className="text-zinc-400 mt-0.5">{a.description}</p>
                  <div className="text-[10px] text-amber-400 mt-1">
                    {a.authorName} • Tel: {a.authorPhone}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {app === 'sos' && (
          <div className="space-y-3">
            <button type="button" onClick={() => setApp('home')} className="text-xs text-amber-400 underline cursor-pointer">
              ← Voltar ao Menu
            </button>
            <textarea
              rows={2}
              value={sosMsg}
              onChange={(e) => setSosMsg(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-xl text-xs"
            />
            <button
              type="button"
              onClick={() => handleEmergency('policia')}
              className="w-full min-h-[44px] py-3 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl cursor-pointer"
            >
              🚓 CHAMAR POLÍCIA NACIONAL (113)
            </button>
            <button
              type="button"
              onClick={() => handleEmergency('medico')}
              className="w-full min-h-[44px] py-3 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-xl cursor-pointer"
            >
              🚑 CHAMAR AMBULÂNCIA INEMA (112)
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};
