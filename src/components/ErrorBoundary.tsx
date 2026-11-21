/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { describeFirestoreError } from '../firebase';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    let message = error?.message || 'Erro inesperado no motor do jogo.';
    try {
      const parsed = JSON.parse(message) as { error?: string; operationType?: string; path?: string };
      if (parsed?.error && parsed?.operationType) {
        message = `${describeFirestoreError(parsed.error)} (${parsed.operationType} em ${parsed.path || 'firestore'})`;
      }
    } catch {
      message = describeFirestoreError(message);
    }
    return {
      hasError: true,
      errorMessage: message,
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen bg-zinc-950 text-white flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-zinc-900 border-2 border-red-500/60 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <AlertTriangle size={40} className="text-amber-400 mx-auto" />
            <h1 className="text-xl font-black uppercase tracking-tight">
              LUANDA RP 🇦🇴 — Falha de Renderização
            </h1>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Ocorreu um problema no teu navegador ao executar a cidade 3D. Podes recarregar a página para retomar a sessão com segurança.
            </p>
            <div className="p-2.5 bg-black/60 border border-zinc-800 rounded-xl text-[11px] font-mono text-red-300 break-words">
              {this.state.errorMessage}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs uppercase rounded-xl flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw size={15} /> Recarregar Cidade
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
