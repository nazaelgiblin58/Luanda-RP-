/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { AccountInfo } from '../../game/types';
import { api, setStoredToken } from '../../services/api';
import {
  KeyRound,
  LogIn,
  UserPlus,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Copy,
  MailCheck,
  Database,
} from 'lucide-react';
import { soundFx } from '../../game/audio/soundFx';
import { useFirebase } from '../../contexts/FirebaseContext';
import { useSupabase } from '../../contexts/SupabaseContext';
import { ensureFirebaseUserDocs } from '../../services/firestoreSync';
import { describeFirestoreError } from '../../firebase';

interface Props {
  onAuthenticated: (account: AccountInfo) => void;
}

export const AuthScreen: React.FC<Props> = ({ onAuthenticated }) => {
  const { signInWithGoogle } = useFirebase();
  const {
    supabaseConfigured,
    configIssue,
    passwordRecoveryMode,
    signInWithSupabase,
    signUpWithSupabase,
    sendPasswordResetSupabase,
    updatePasswordSupabase,
    clearPasswordRecoveryMode,
  } = useSupabase();

  const [mode, setMode] = useState<'login' | 'register' | 'recover'>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [generatedRecovery, setGeneratedRecovery] = useState<{ code: string; account: AccountInfo } | null>(null);

  const handleGoogleLogin = async () => {
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const user = await signInWithGoogle();
      const idToken = await user.getIdToken();
      const res = await api.firebaseLogin(idToken);
      setStoredToken(res.token);
      try {
        await ensureFirebaseUserDocs(user, res.account.id);
      } catch (fsErr) {
        console.warn(describeFirestoreError(fsErr));
      }
      soundFx.playCashRegister();
      onAuthenticated(res.account);
    } catch (err: unknown) {
      setError(describeFirestoreError(err) || 'Falha na autenticação Google Firebase.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (newPassword.length < 6) {
      setError('A nova palavra-passe deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('As palavras-passe não coincidem.');
      return;
    }
    setLoading(true);
    try {
      await updatePasswordSupabase(newPassword);
      soundFx.playCashRegister();
      setNewPassword('');
      setConfirmNewPassword('');
      setMode('login');
      setSuccessMsg('Palavra-passe redefinida com sucesso! Já podes entrar na tua conta.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar palavra-passe.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      if (supabaseConfigured) {
        if (mode === 'login') {
          const { session } = await signInWithSupabase(email, password);
          const res = await api.supabaseLogin(session.access_token);
          setStoredToken(res.token);
          soundFx.playInteract();
          onAuthenticated(res.account);
        } else if (mode === 'register') {
          const reg = await signUpWithSupabase(email, password, displayName);
          if (reg.requiresEmailConfirmation || !reg.session) {
            soundFx.playInteract();
            setMode('login');
            setPassword('');
            setSuccessMsg(
              'Conta criada no Supabase! Verifica a tua caixa de entrada para confirmar o email antes de entrar.'
            );
            return;
          }
          const res = await api.supabaseLogin(reg.session.access_token);
          setStoredToken(res.token);
          soundFx.playCashRegister();
          onAuthenticated(res.account);
        } else {
          await sendPasswordResetSupabase(email);
          soundFx.playInteract();
          setMode('login');
          setSuccessMsg(
            'Email de recuperação enviado! Clica no link enviado para o teu email para definir uma nova palavra-passe.'
          );
        }
      } else {
        if (mode === 'login') {
          const res = await api.login(email, password);
          setStoredToken(res.token);
          soundFx.playInteract();
          onAuthenticated(res.account);
        } else if (mode === 'register') {
          const res = await api.register(email, password);
          setStoredToken(res.token);
          soundFx.playCashRegister();
          setGeneratedRecovery({ code: res.recoveryCode, account: res.account });
        } else {
          const res = await api.recoverPassword(email, recoveryCode, newPassword);
          soundFx.playInteract();
          setPassword('');
          setMode('login');
          setSuccessMsg(`Palavra-passe atualizada! Novo código de recuperação: ${res.newRecoveryCode}`);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao autenticar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[999] pointer-events-auto flex items-center justify-center p-4 bg-gradient-to-b from-black/95 via-zinc-950/95 to-black text-white select-none overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md bg-zinc-900 border-2 border-amber-500/60 rounded-2xl shadow-2xl p-6 space-y-5 pointer-events-auto"
      >
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/60 border border-amber-500/40 text-[11px] font-bold text-amber-400">
            <span>REPÚBLICA DE ANGOLA 🇦🇴</span>
            <span>•</span>
            <span>SERVIDOR MULTIPLAYER</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight uppercase">
            <span className="text-white">LUANDA</span>
            <span className="text-amber-400 ml-1.5">RP</span>
          </h1>
          <p className="text-xs text-zinc-400">
            Acede à tua conta persistente para entrares na cidade e guardares personagens, Kwanzas e viaturas.
          </p>
        </div>

        {!supabaseConfigured && configIssue && (
          <div className="p-3 bg-amber-950/50 border border-amber-500/50 rounded-xl text-[11px] text-amber-200 flex items-start gap-2">
            <Database size={15} className="text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Configuração Supabase pendente:</strong> {configIssue}
            </span>
          </div>
        )}

        {passwordRecoveryMode ? (
          <form onSubmit={handleRecoveryUpdate} className="space-y-3.5">
            <div className="p-3 bg-sky-950/50 border border-sky-500/50 rounded-xl text-xs text-sky-200 flex items-center gap-2">
              <KeyRound size={16} className="text-sky-400 shrink-0" />
              <span>Link de recuperação validado! Define agora a tua nova palavra-passe.</span>
            </div>

            {error && (
              <div className="p-3 bg-red-950/60 border border-red-500/50 rounded-xl text-xs text-red-200 flex items-center gap-2">
                <AlertCircle size={16} className="text-red-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Nova Palavra-Passe</label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full px-3.5 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Confirmar Nova Palavra-Passe</label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Repete a palavra-passe"
                className="w-full px-3.5 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:brightness-110 disabled:opacity-50 text-zinc-950 font-black text-sm uppercase tracking-wider rounded-xl shadow-xl transition cursor-pointer"
            >
              {loading ? 'A guardar...' : 'Guardar Nova Palavra-Passe'}
            </button>
            <button
              type="button"
              onClick={clearPasswordRecoveryMode}
              className="w-full py-2 text-xs text-zinc-400 hover:text-white cursor-pointer"
            >
              Voltar ao Login
            </button>
          </form>
        ) : generatedRecovery ? (
          <div className="p-4 bg-emerald-950/50 border border-emerald-500/60 rounded-xl space-y-3 text-center">
            <CheckCircle2 size={32} className="text-emerald-400 mx-auto" />
            <h3 className="font-bold text-base text-white">Conta Criada com Sucesso!</h3>
            <p className="text-xs text-zinc-300">
              Guarda o teu <strong>Código de Recuperação</strong> caso precises de redefinir a palavra-passe:
            </p>
            <div className="flex items-center justify-center gap-2 py-2.5 px-4 bg-black/60 border border-emerald-500/40 rounded-xl font-mono text-2xl font-black tracking-widest text-amber-400">
              <span>{generatedRecovery.code}</span>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(generatedRecovery.code)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg cursor-pointer"
                title="Copiar código"
              >
                <Copy size={16} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => onAuthenticated(generatedRecovery.account)}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-sm rounded-xl transition cursor-pointer"
            >
              Continuar para Seleção de Personagem
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-950 rounded-xl border border-zinc-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(null); setSuccessMsg(null); }}
                className={`py-2 rounded-lg transition cursor-pointer ${
                  mode === 'login' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setError(null); setSuccessMsg(null); }}
                className={`py-2 rounded-lg transition cursor-pointer ${
                  mode === 'register' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Registar
              </button>
              <button
                type="button"
                onClick={() => { setMode('recover'); setError(null); setSuccessMsg(null); }}
                className={`py-2 rounded-lg transition cursor-pointer ${
                  mode === 'recover' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Recuperar
              </button>
            </div>

            {successMsg && (
              <div className="p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-xs text-emerald-200 flex items-center gap-2">
                <MailCheck size={16} className="text-emerald-400 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-950/60 border border-red-500/50 rounded-xl text-xs text-red-200 flex items-center gap-2">
                <AlertCircle size={16} className="text-red-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {mode === 'register' && supabaseConfigured && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Nome do Jogador</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ex: Mateus Kizomba"
                    className="w-full px-3.5 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Email da Conta</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cidadao@luanda.ao"
                  className="w-full px-3.5 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {mode !== 'recover' ? (
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">Palavra-Passe</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full px-3.5 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              ) : supabaseConfigured ? (
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Introduz o email da tua conta para receberes um link oficial de redefinição de palavra-passe.
                </p>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">Código de Recuperação (6 dígitos)</label>
                    <input
                      type="text"
                      required
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value)}
                      placeholder="Ex: 482910"
                      className="w-full px-3.5 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">Nova Palavra-Passe</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full px-3.5 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:brightness-110 disabled:opacity-50 text-zinc-950 font-black text-sm uppercase tracking-wider rounded-xl shadow-xl transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {mode === 'login' && <LogIn size={18} />}
                {mode === 'register' && <UserPlus size={18} />}
                {mode === 'recover' && <KeyRound size={18} />}
                <span>
                  {loading
                    ? 'A autenticar...'
                    : mode === 'login'
                    ? 'Entrar no Servidor'
                    : mode === 'register'
                    ? 'Criar Conta Luanda RP'
                    : supabaseConfigured
                    ? 'Enviar Email de Recuperação'
                    : 'Redefinir Palavra-Passe'}
                </span>
              </button>
            </form>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-zinc-800" />
              <span className="mx-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">ou continua na nuvem</span>
              <div className="flex-grow border-t border-zinc-800" />
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleGoogleLogin}
              className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-600/80 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M12 5c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0 7.39 0 3.41 2.64 1.44 6.51l3.66 2.84C5.98 6.81 8.75 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.76 2.91c2.2-2.03 3.66-5.02 3.66-8.73z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.1 14.65c-.22-.66-.35-1.36-.35-2.15s.13-1.49.35-2.15L1.44 7.51C.52 9.35 0 11.41 0 13.5c0 2.09.52 4.15 1.44 5.99l3.66-2.84z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.76-2.91c-1.07.72-2.44 1.15-4.17 1.15-3.25 0-6.02-1.81-6.9-4.68l-3.66 2.84C3.41 21.36 7.39 24 12 24z"
                />
              </svg>
              <span>Entrar com Google (Firebase)</span>
            </button>

            <div className="pt-3 border-t border-zinc-800 flex items-center justify-center gap-2 text-[11px] text-zinc-500">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span>
                {supabaseConfigured
                  ? 'Supabase Auth + PostgreSQL RLS + Realtime ativo'
                  : 'Autenticação segura & sincronização em tempo real'}
              </span>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
};
