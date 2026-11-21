/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  GpsWaypoint,
  InemaEmergencyCall,
  InventoryItem,
  LawyerCaseRecord,
  OwnedVehicleRecord,
  PlayerStats,
} from '../../game/types';
import {
  api,
  CharacterRecord,
  CriminalRecord,
  MedicalRecord,
  WarrantRecord,
} from '../../services/api';
import {
  Shield,
  HeartPulse,
  Scale,
  Search,
  AlertCircle,
  CheckCircle2,
  X,
  Briefcase,
  Navigation,
  Eye,
  Lock,
  Unlock,
  Ban,
} from 'lucide-react';
import { soundFx } from '../../game/audio/soundFx';

interface Props {
  characterId: string;
  stats: PlayerStats;
  initialTab?: 'police' | 'court' | 'hospital' | 'lawyers';
  onCharacterSynced: (char: CharacterRecord) => void;
  onSetGpsWaypoint?: (wp: GpsWaypoint) => void;
  onClose: () => void;
}

export const JusticeHospitalModal: React.FC<Props> = ({
  characterId,
  stats,
  initialTab = 'police',
  onCharacterSynced,
  onSetGpsWaypoint,
  onClose,
}) => {
  const [tab, setTab] = useState<'police' | 'court' | 'hospital' | 'lawyers'>(initialTab);
  const [query, setQuery] = useState('');
  const [citizens, setCitizens] = useState<{
    id: string;
    name: string;
    idNumber: string;
    phone: string;
    factionId?: string | null;
    wantedStars: number;
    jailUntil: number;
    health: number;
    isUnconscious: boolean;
    handcuffed?: boolean;
    escortedByCharId?: string | null;
  }[]>([]);
  const [vehicles, setVehicles] = useState<OwnedVehicleRecord[]>([]);
  const [warrants, setWarrants] = useState<WarrantRecord[]>([]);
  const [criminalRecords, setCriminalRecords] = useState<CriminalRecord[]>([]);
  const [medicalHistory, setMedicalHistory] = useState<MedicalRecord[]>([]);
  const [inemaCalls, setInemaCalls] = useState<InemaEmergencyCall[]>([]);
  const [lawyerCases, setLawyerCases] = useState<LawyerCaseRecord[]>([]);
  const [lawyersList, setLawyersList] = useState<{ characterId: string; name: string; rank: string; level: number }[]>([]);
  const [policeStash, setPoliceStash] = useState<InventoryItem[]>([]);
  const [inspectedProfile, setInspectedProfile] = useState<{
    id: string;
    name: string;
    idNumber: string;
    phone: string;
    nationality: string;
    wantedStars: number;
    factionId: string | null;
    inventory: { name: string; category: string; quantity: number }[];
  } | null>(null);

  const [reason, setReason] = useState('Infração ao Código de Estrada');
  const [fineAmt, setFineAmt] = useState(3500);
  const [jailMins, setJailMins] = useState(2);
  const [inemaReason, setInemaReason] = useState('Ferido em via pública — urgência INEMA 112');
  const [caseSummary, setCaseSummary] = useState('Defesa criminal e pedido de liberdade condicional');
  const [caseFeeKz, setCaseFeeKz] = useState(5000);
  const [caseClientId, setCaseClientId] = useState(characterId);
  const [rulingNote, setRulingNote] = useState('Acordo judicial homologado em Tribunal');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const loadCad = useCallback(async () => {
    try {
      const [cadRes, hospRes, lawRes] = await Promise.all([
        api.getJusticeCad(query),
        api.hospitalGetCalls().catch(() => null),
        api.lawyersGetCases().catch(() => null),
      ]);
      setCitizens(cadRes.citizens);
      setVehicles(cadRes.vehicles);
      setWarrants(cadRes.warrants);
      setCriminalRecords(cadRes.criminalRecords);
      setMedicalHistory(hospRes?.medicalHistory || cadRes.medicalHistory);
      setInemaCalls(hospRes?.calls || cadRes.inemaCalls || []);
      setLawyerCases(lawRes?.cases || cadRes.lawyerCases || []);
      if (lawRes?.lawyers) setLawyersList(lawRes.lawyers);
      setPoliceStash(cadRes.policeStash || []);
    } catch {}
  }, [query]);

  useEffect(() => {
    loadCad();
  }, [loadCad]);

  const execJustice = async (
    action:
      | 'pay_bail'
      | 'pay_fines'
      | 'buy_weapon_license'
      | 'renew_weapon_license'
      | 'fine'
      | 'arrest'
      | 'warrant'
      | 'impound'
      | 'handcuff'
      | 'unhandcuff'
      | 'escort'
      | 'unescort'
      | 'check_id'
      | 'seize_items',
    opts?: {
      targetCharId?: string;
      vehiclePlate?: string;
      amountKz?: number;
      reason?: string;
      minutes?: number;
      payWith?: 'cash' | 'bank';
    }
  ) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.justiceAction(characterId, action, opts);
      soundFx.playInteract();
      onCharacterSynced(res.character);
      if (res.inspectedProfile) {
        setInspectedProfile(res.inspectedProfile);
      }
      await loadCad();
      const extra =
        typeof res.seizedCount === 'number'
          ? ` (${res.seizedCount} itens ilegais apreendidos)`
          : '';
      setFeedback({ type: 'ok', msg: `Operação PNA '${action}' executada${extra}!` });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Sem autorização ou erro PNA.' });
    } finally {
      setLoading(false);
    }
  };

  const execHospital = async (
    action:
      | 'self_treat'
      | 'revive_player'
      | 'inema_field_revive'
      | 'request_112'
      | 'accept_call'
      | 'transport_hospital'
      | 'discharge',
    targetCharId?: string,
    opts?: { callId?: string; reason?: string }
  ) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.hospitalAction(characterId, action, targetCharId, opts);
      soundFx.playInteract();
      onCharacterSynced(res.character);
      setMedicalHistory(res.medicalHistory);
      if (res.calls) setInemaCalls(res.calls);
      await loadCad();
      setFeedback({ type: 'ok', msg: `Protocolo INEMA (${action}) concluído!` });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro no protocolo INEMA.' });
    } finally {
      setLoading(false);
    }
  };

  const execLawyer = async (
    action: 'open_case' | 'hire_lawyer' | 'hire_accept' | 'request_bail' | 'court_hearing' | 'conclude_case',
    opts?: {
      caseId?: string;
      clientCharId?: string;
      chargeSummary?: string;
      feeKz?: number;
      bailKz?: number;
      ruling?: 'acquitted' | 'reduced';
      note?: string;
    }
  ) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.lawyersAction(characterId, action, opts);
      soundFx.playInteract();
      onCharacterSynced(res.character);
      setLawyerCases(res.cases);
      await loadCad();
      setFeedback({ type: 'ok', msg: `Processo OAA (${action}) atualizado!` });
    } catch (err: unknown) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Operação jurídica rejeitada.' });
    } finally {
      setLoading(false);
    }
  };

  const isPoliceMember = stats.factionId === 'policia';
  const isHospitalMember = stats.factionId === 'hospital';
  const isLawyerMember = stats.factionId === 'advogados';

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
        className="relative z-10 pointer-events-auto w-full max-w-4xl bg-zinc-900 border-2 border-blue-500/70 rounded-2xl shadow-2xl p-4 sm:p-6 text-white max-h-[90dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
              <Shield size={22} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                Polícia PNA, OAA Advogados, Tribunal & Hospital INEMA
              </h2>
              <p className="text-xs text-zinc-400">
                CAD Policial, Algemar/Revistar, Urgências 112 e Processos Judiciais
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-zinc-950 rounded-xl border border-zinc-800 text-xs font-bold my-4">
          <button
            type="button"
            onClick={() => setTab('police')}
            className={`min-h-[38px] py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'police' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Shield size={14} /> Terminal PNA
          </button>
          <button
            type="button"
            onClick={() => setTab('lawyers')}
            className={`min-h-[38px] py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'lawyers' ? 'bg-amber-600 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Briefcase size={14} /> OAA Advogados
          </button>
          <button
            type="button"
            onClick={() => setTab('court')}
            className={`min-h-[38px] py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'court' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Scale size={14} /> Tribunal & Fiança
          </button>
          <button
            type="button"
            onClick={() => setTab('hospital')}
            className={`min-h-[38px] py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'hospital' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <HeartPulse size={14} /> Hospital INEMA
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

        {tab === 'police' && (
          <div className="space-y-4">
            {/* SERVIÇOS DO CIDADÃO PNA: PORTES DE ARMA & MULTAS */}
            {(() => {
              const licenseUntil = stats.weaponLicenseUntil || 0;
              const hasActiveLicense = licenseUntil > Date.now();
              const pendingFines = stats.unpaidFinesKz || 0;
              const daysLeft = hasActiveLicense
                ? Math.max(1, Math.ceil((licenseUntil - Date.now()) / (24 * 60 * 60 * 1000)))
                : 0;
              return (
                <div className="p-3.5 bg-zinc-950/90 border border-blue-500/50 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="font-bold text-blue-300 uppercase">
                      Balcão do Cidadão PNA — Porte de Arma & Multas
                    </div>
                    <div className="text-zinc-300 flex flex-wrap gap-3 tabular-nums">
                      <span>
                        Porte de Arma:{' '}
                        <strong className={hasActiveLicense ? 'text-emerald-400' : 'text-red-400'}>
                          {hasActiveLicense ? `Válido (${daysLeft} dia(s))` : 'Sem Porte / Expirado'}
                        </strong>
                      </span>
                      <span>
                        Multas Pendentes:{' '}
                        <strong className={pendingFines > 0 ? 'text-amber-300' : 'text-emerald-400'}>
                          {pendingFines.toLocaleString('pt-AO')} Kz
                        </strong>
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {pendingFines > 0 && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => execJustice('pay_fines', { payWith: stats.bankKz >= pendingFines ? 'bank' : 'cash' })}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded-lg cursor-pointer"
                      >
                        Pagar Multas ({pendingFines.toLocaleString('pt-AO')} Kz)
                      </button>
                    )}
                    {!hasActiveLicense ? (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => execJustice('buy_weapon_license', { payWith: stats.bankKz >= 50000 ? 'bank' : 'cash' })}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg cursor-pointer"
                      >
                        Emitir Porte de Arma (50.000 Kz)
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => execJustice('renew_weapon_license', { payWith: stats.bankKz >= 25000 ? 'bank' : 'cash' })}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg cursor-pointer"
                      >
                        Renovar Porte +15d (25.000 Kz)
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
            <div className="flex flex-wrap gap-2">
              <div className="flex-1 min-w-[190px] flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-xl px-3">
                <Search size={15} className="text-zinc-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Pesquisar Nome, BI ou Matrícula (LD-...)"
                  className="w-full py-2 bg-transparent text-xs text-white focus:outline-none"
                />
              </div>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motivo da Ocorrência"
                className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs w-52"
              />
              <input
                type="number"
                value={fineAmt}
                onChange={(e) => setFineAmt(Number(e.target.value))}
                className="px-2 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs font-mono w-24"
                title="Valor Multa Kz"
              />
              <input
                type="number"
                min={1}
                max={10}
                value={jailMins}
                onChange={(e) => setJailMins(Number(e.target.value))}
                className="px-2 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-xs font-mono w-16"
                title="Minutos Prisão"
              />
            </div>

            {inspectedProfile && (
              <div className="p-3 bg-blue-950/40 border border-blue-500/60 rounded-xl text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-blue-300">
                    🪪 BI & Revista: {inspectedProfile.name} ({inspectedProfile.idNumber})
                  </div>
                  <button
                    type="button"
                    onClick={() => setInspectedProfile(null)}
                    className="text-zinc-400 hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <div className="text-zinc-300 font-mono text-[11px]">
                  Nacionalidade: {inspectedProfile.nationality} · Tel: {inspectedProfile.phone} · ★{' '}
                  {inspectedProfile.wantedStars} · Facção: {inspectedProfile.factionId || 'Civil'}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {inspectedProfile.inventory.length === 0 ? (
                    <span className="text-zinc-400">Mochila vazia.</span>
                  ) : (
                    inspectedProfile.inventory.map((it, idx) => (
                      <span
                        key={`${it.name}-${idx}`}
                        className="px-2 py-0.5 bg-zinc-950 border border-zinc-700 rounded text-[11px]"
                      >
                        {it.name} x{it.quantity} ({it.category})
                      </span>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {citizens.map((c) => (
                <div
                  key={c.id}
                  className="p-3 bg-zinc-800/60 border border-zinc-700 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-bold text-white flex flex-wrap items-center gap-1.5">
                      <span>{c.name}</span>
                      {c.wantedStars > 0 && <span className="text-red-400">★{c.wantedStars}</span>}
                      {c.handcuffed && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-600/30 border border-amber-400/50 text-amber-300 text-[10px]">
                          ALGEMADO
                        </span>
                      )}
                      {c.escortedByCharId && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-600/30 border border-blue-400/50 text-blue-300 text-[10px]">
                          ESCOLTADO
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-zinc-400">
                      BI: {c.idNumber} · Tel: {c.phone} · Vida: {Math.round(c.health)}%
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {isPoliceMember && (
                      <>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() =>
                            execJustice(c.handcuffed ? 'unhandcuff' : 'handcuff', { targetCharId: c.id })
                          }
                          className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                        >
                          {c.handcuffed ? <Unlock size={11} /> : <Lock size={11} />}
                          {c.handcuffed ? 'Desalgemar' : 'Algemar'}
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() =>
                            execJustice(c.escortedByCharId ? 'unescort' : 'escort', { targetCharId: c.id })
                          }
                          className="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 rounded-lg font-bold cursor-pointer"
                        >
                          {c.escortedByCharId ? 'Soltar' : 'Escoltar'}
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => execJustice('check_id', { targetCharId: c.id })}
                          className="px-2 py-1 bg-sky-700 hover:bg-sky-600 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Eye size={11} /> Ver BI & Revistar
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => execJustice('seize_items', { targetCharId: c.id })}
                          className="px-2 py-1 bg-purple-700 hover:bg-purple-600 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Ban size={11} /> Apreender Ilegais
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => execJustice('fine', { targetCharId: c.id, amountKz: fineAmt, reason })}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 rounded-lg font-bold cursor-pointer"
                    >
                      Multar
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => execJustice('warrant', { targetCharId: c.id, reason })}
                      className="px-2.5 py-1 bg-orange-600 hover:bg-orange-500 rounded-lg font-bold cursor-pointer"
                    >
                      Mandado
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => execJustice('arrest', { targetCharId: c.id, reason, minutes: jailMins })}
                      className="px-2.5 py-1 bg-red-600 hover:bg-red-500 rounded-lg font-bold cursor-pointer"
                    >
                      Prender ({jailMins}m)
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {vehicles.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase text-zinc-400">Viaturas Registadas</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {vehicles.slice(0, 6).map((v) => (
                    <div
                      key={v.id}
                      className="p-2.5 bg-zinc-800/60 border border-zinc-700 rounded-xl flex items-center justify-between text-xs"
                    >
                      <span>
                        <strong>{v.plate}</strong> ({v.name})
                      </span>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => execJustice('impound', { vehiclePlate: v.plate })}
                        className="px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-[11px] font-bold cursor-pointer"
                      >
                        Apreender
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {policeStash.length > 0 && (
              <div className="p-3 bg-zinc-950/75 border border-zinc-800 rounded-xl space-y-1.5 text-xs">
                <div className="font-bold uppercase text-blue-300">
                  Depósito de Apreensões PNA ({policeStash.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {policeStash.slice(0, 12).map((item) => (
                    <span
                      key={item.id}
                      className="px-2 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-[11px]"
                    >
                      {item.name} x{item.quantity}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'lawyers' && (
          <div className="space-y-4">
            <div className="p-3.5 bg-amber-950/35 border border-amber-500/50 rounded-xl space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-sm text-amber-300">
                    Ordem dos Advogados de Angola (OAA) — Defesa & Fianças
                  </h4>
                  <p className="text-zinc-300">
                    Advogados inscritos ({lawyersList.length}):{' '}
                    {lawyersList.length > 0
                      ? lawyersList.map((l) => `${l.name} (${l.rank})`).join(', ')
                      : 'Nenhum advogado ativo no turno.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <select
                  value={caseClientId}
                  onChange={(e) => setCaseClientId(e.target.value)}
                  className="px-2.5 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-xs"
                >
                  <option value={characterId}>Eu ({stats.name})</option>
                  {citizens
                    .filter((c) => c.id !== characterId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (★{c.wantedStars})
                      </option>
                    ))}
                </select>
                <input
                  type="text"
                  value={caseSummary}
                  onChange={(e) => setCaseSummary(e.target.value)}
                  placeholder="Resumo do processo / defesa"
                  className="px-2.5 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-xs"
                />
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    value={caseFeeKz}
                    onChange={(e) => setCaseFeeKz(Number(e.target.value))}
                    className="w-24 px-2 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-xs font-mono"
                    title="Honorários Kz"
                  />
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() =>
                      execLawyer('hire_lawyer', {
                        clientCharId: characterId,
                        chargeSummary: caseSummary,
                        feeKz: caseFeeKz,
                      })
                    }
                    className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded-lg cursor-pointer"
                  >
                    Contratar Advogado
                  </button>
                </div>
              </div>

              {isLawyerMember && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <input
                    type="text"
                    value={rulingNote}
                    onChange={(e) => setRulingNote(e.target.value)}
                    placeholder="Nota de audiência / parecer jurídico"
                    className="flex-1 min-w-[200px] px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded-lg text-xs"
                  />
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() =>
                      execLawyer('open_case', {
                        clientCharId: caseClientId,
                        chargeSummary: caseSummary,
                        feeKz: caseFeeKz,
                      })
                    }
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg cursor-pointer"
                  >
                    Abrir Processo (OAA)
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              <div className="text-xs font-bold uppercase text-zinc-400">
                Processos & Defesas Ativas ({lawyerCases.length})
              </div>
              {lawyerCases.length === 0 ? (
                <p className="text-xs text-zinc-500">Sem processos registados no Tribunal.</p>
              ) : (
                lawyerCases.map((lc) => (
                  <div
                    key={lc.id}
                    className="p-3 bg-zinc-800/60 border border-zinc-700 rounded-xl text-xs space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <strong className="text-white">{lc.clientName}</strong>{' '}
                        <span className="text-zinc-400">
                          · Advogado: {lc.lawyerName || 'Aguarda OAA'} · Honorários:{' '}
                          {lc.feeKz.toLocaleString('pt-AO')} Kz
                        </span>
                        <div className="text-zinc-300 mt-0.5">{lc.chargeSummary}</div>
                        {lc.rulingNote && (
                          <div className="text-emerald-300 text-[11px] mt-0.5">Sentença: {lc.rulingNote}</div>
                        )}
                      </div>
                      <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-700 uppercase font-mono text-[10px] text-amber-300">
                        {lc.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {isLawyerMember && lc.status === 'open' && (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => execLawyer('hire_accept', { caseId: lc.id })}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold cursor-pointer"
                        >
                          Aceitar Cliente
                        </button>
                      )}
                      {isLawyerMember && (lc.status === 'hired' || lc.status === 'open') && (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() =>
                            execLawyer('request_bail', { caseId: lc.id, bailKz: Math.max(4000, lc.feeKz) })
                          }
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 rounded-lg font-bold cursor-pointer"
                        >
                          Pedir Fiança
                        </button>
                      )}
                      {(isLawyerMember || isPoliceMember) &&
                        lc.status !== 'acquitted' &&
                        lc.status !== 'closed' && (
                          <>
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() =>
                                execLawyer('court_hearing', {
                                  caseId: lc.id,
                                  ruling: 'acquitted',
                                  note: rulingNote,
                                })
                              }
                              className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 rounded-lg font-bold cursor-pointer"
                            >
                              Audiência: Absolver
                            </button>
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() =>
                                execLawyer('court_hearing', {
                                  caseId: lc.id,
                                  ruling: 'reduced',
                                  note: rulingNote,
                                })
                              }
                              className="px-2.5 py-1 bg-sky-700 hover:bg-sky-600 rounded-lg font-bold cursor-pointer"
                            >
                              Audiência: Reduzir Pena
                            </button>
                          </>
                        )}
                      {isLawyerMember && lc.status !== 'closed' && (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => execLawyer('conclude_case', { caseId: lc.id, note: rulingNote })}
                          className="px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 rounded-lg font-bold cursor-pointer"
                        >
                          Encerrar
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {tab === 'court' && (
          <div className="space-y-4">
            {(stats.wantedStars > 0 || stats.jailUntil > Date.now()) && (
              <div className="p-4 bg-amber-950/40 border border-amber-500/60 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <strong className="text-amber-300 text-sm block">Situação Judicial Ativa</strong>
                  <span className="text-zinc-300">
                    Estrelas Procurado: {stats.wantedStars} ★{' '}
                    {stats.jailUntil > Date.now() && `• Prisão: ${stats.jailReason}`}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => execJustice('pay_bail')}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black rounded-xl cursor-pointer"
                >
                  Pagar Fiança ({Math.max(5000, stats.wantedStars * 4000).toLocaleString('pt-AO')} Kz)
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase text-red-400">Mandados Ativos ({warrants.length})</span>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {warrants.length === 0 ? (
                    <p className="text-xs text-zinc-500">Sem mandados ativos.</p>
                  ) : (
                    warrants.map((w) => (
                      <div key={w.id} className="p-2.5 bg-zinc-800/60 border border-zinc-700 rounded-xl text-xs">
                        <div className="font-bold text-white">{w.targetName}</div>
                        <div className="text-zinc-400">
                          {w.reason} (Por {w.issuedBy})
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase text-amber-400">Registo Criminal Recente</span>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {criminalRecords.length === 0 ? (
                    <p className="text-xs text-zinc-500">Registo limpo em Luanda.</p>
                  ) : (
                    criminalRecords.map((r) => (
                      <div key={r.id} className="p-2.5 bg-zinc-800/60 border border-zinc-700 rounded-xl text-xs">
                        <div className="font-bold text-white">
                          {r.characterName} — <span className="uppercase text-amber-400">{r.type}</span>
                        </div>
                        <div className="text-zinc-400">
                          {r.reason} · Agente {r.officerName}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'hospital' && (
          <div className="space-y-4">
            <div className="p-4 bg-red-950/30 border border-red-500/40 rounded-xl flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-sm text-white">Urgência Hospital Josina Machel (INEMA)</h4>
                <p className="text-xs text-zinc-300">
                  Restaura 100% de Vida, Energia e estanca qualquer hemorragia por 1.800 Kz.
                </p>
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => execHospital('self_treat')}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-xl cursor-pointer"
              >
                Receber Tratamento (1.800 Kz)
              </button>
            </div>

            <div className="p-3 bg-zinc-800/60 border border-zinc-700 rounded-xl flex flex-wrap items-center gap-2 text-xs">
              <input
                type="text"
                value={inemaReason}
                onChange={(e) => setInemaReason(e.target.value)}
                placeholder="Motivo da emergência 112..."
                className="flex-1 min-w-[200px] px-2.5 py-2 bg-zinc-950 border border-zinc-700 rounded-lg"
              />
              <button
                type="button"
                disabled={loading}
                onClick={() => execHospital('request_112', undefined, { reason: inemaReason })}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg cursor-pointer"
              >
                🚑 Chamar INEMA 112
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              <span className="text-xs font-bold uppercase text-sky-400">
                Chamados INEMA 112 em Tempo Real ({inemaCalls.length})
              </span>
              {inemaCalls.length === 0 ? (
                <p className="text-xs text-zinc-500">Sem chamados 112 ativos.</p>
              ) : (
                inemaCalls.map((call) => (
                  <div
                    key={call.id}
                    className="p-2.5 bg-zinc-800/70 border border-zinc-700 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-bold text-white">
                        {call.patientName}{' '}
                        <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-sky-300">
                          {call.status}
                        </span>
                      </div>
                      <div className="text-zinc-400">
                        {call.reason}
                        {call.medicName ? ` · Socorrista: ${call.medicName}` : ''}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {onSetGpsWaypoint && (
                        <button
                          type="button"
                          onClick={() => {
                            onSetGpsWaypoint({
                              label: `112: ${call.patientName}`,
                              x: call.pos.x,
                              z: call.pos.z,
                            });
                            onClose();
                          }}
                          className="px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Navigation size={11} /> GPS
                        </button>
                      )}
                      {isHospitalMember && call.status === 'waiting' && (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => execHospital('accept_call', call.patientCharId, { callId: call.id })}
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold cursor-pointer"
                        >
                          Aceitar Chamado
                        </button>
                      )}
                      {call.status !== 'resolved' && (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => execHospital('inema_field_revive', call.patientCharId, { callId: call.id })}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold cursor-pointer"
                        >
                          Reanimar em Campo
                        </button>
                      )}
                      {isHospitalMember && call.status !== 'resolved' && (
                        <>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() =>
                              execHospital('transport_hospital', call.patientCharId, { callId: call.id })
                            }
                            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 rounded-lg font-bold cursor-pointer"
                          >
                            Transportar Hospital
                          </button>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => execHospital('discharge', call.patientCharId, { callId: call.id })}
                            className="px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 rounded-lg font-bold cursor-pointer"
                          >
                            Dar Alta
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {citizens.some((c) => c.isUnconscious) && (
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase text-emerald-400">
                  Pacientes Inconscientes (Para Médicos INEMA Reanimarem)
                </span>
                {citizens
                  .filter((c) => c.isUnconscious)
                  .map((c) => (
                    <div
                      key={c.id}
                      className="p-2.5 bg-zinc-800/70 border border-zinc-700 rounded-xl flex items-center justify-between text-xs"
                    >
                      <span>{c.name} (Inconsciente)</span>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => execHospital('revive_player', c.id)}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold cursor-pointer"
                      >
                        Reanimar (+3.000 Kz)
                      </button>
                    </div>
                  ))}
              </div>
            )}

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              <span className="text-xs font-bold uppercase text-zinc-400">Histórico Médico Recente</span>
              {medicalHistory.map((m) => (
                <div
                  key={m.id}
                  className="p-2.5 bg-zinc-800/60 border border-zinc-700 rounded-xl text-xs flex justify-between"
                >
                  <div>
                    <strong className="text-white">{m.characterName}</strong> — {m.treatment}
                    <div className="text-[10px] text-zinc-400">Médico: {m.doctorName}</div>
                  </div>
                  <span className="font-mono text-emerald-400">{m.costKz.toLocaleString('pt-AO')} Kz</span>
                </div>
              ))}
            </div>
          </div>
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
