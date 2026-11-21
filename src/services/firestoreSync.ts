/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { CharacterRecord } from './api';

// Constantes sincronizadas com firebase-blueprint.json & firestore.rules
const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

function sanitizeId(raw: string, maxLen: number, fallback = 'item'): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, maxLen);
  if (!cleaned || !VALID_ID_REGEX.test(cleaned)) {
    return fallback.slice(0, maxLen);
  }
  return cleaned;
}

function clampString(raw: string | null | undefined, maxLen: number, fallback: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return fallback.slice(0, maxLen);
  return trimmed.slice(0, maxLen);
}

function clampNumber(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}

export async function ensureFirebaseUserDocs(user: User, linkedAccountId: string): Promise<void> {
  if (!user.uid || !user.emailVerified) return;

  const uid = sanitizeId(user.uid, 128);
  const displayName = clampString(
    user.displayName || user.email?.split('@')[0],
    64,
    'Cidadão Luanda'
  );
  const safeLinkedAccountId = sanitizeId(linkedAccountId, 64, 'acc_luanda');
  const safeEmail = clampString(user.email, 120, 'cidadao@luanda.ao');

  const userPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  let userSnap;
  try {
    userSnap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  if (!userSnap.exists()) {
    try {
      await setDoc(userRef, {
        uid,
        displayName,
        role: 'player',
        linkedAccountId: safeLinkedAccountId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, userPath);
    }
  } else {
    try {
      await updateDoc(userRef, {
        displayName,
        linkedAccountId: safeLinkedAccountId,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, userPath);
    }
  }

  const privatePath = `users/${uid}/private/info`;
  const privateRef = doc(db, 'users', uid, 'private', 'info');

  let privateSnap;
  try {
    privateSnap = await getDoc(privateRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, privatePath);
  }

  if (!privateSnap.exists()) {
    try {
      await setDoc(privateRef, {
        uid,
        email: safeEmail,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, privatePath);
    }
  } else {
    try {
      await updateDoc(privateRef, {
        email: safeEmail,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, privatePath);
    }
  }
}

export async function syncCharacterToFirestore(
  user: User,
  char: CharacterRecord,
  district: string,
  linkedAccountId?: string
): Promise<void> {
  if (!user.uid || !user.emailVerified) return;

  const uid = sanitizeId(user.uid, 128);
  const characterId = sanitizeId(char.id, 64);

  // Garante existência do documento pai /users/{uid} antes de escrever /characters/{id}
  await ensureFirebaseUserDocs(user, linkedAccountId || char.accountId);

  const name = clampString(char.stats.name, 40, 'Cidadão');
  const surname = clampString(char.stats.surname, 40, 'Luanda');
  const idNumber = sanitizeId(char.stats.idNumber || '001LA001', 32, '001LA001');
  const level = Math.round(clampNumber(char.stats.level, 1, 500));
  const cashKz = Number(clampNumber(char.stats.cashKz, 0, 10_000_000_000).toFixed(2));
  const bankKz = Number(clampNumber(char.stats.bankKz, 0, 10_000_000_000).toFixed(2));
  const factionId = sanitizeId(char.stats.factionId || 'civil', 48, 'civil');
  const factionRank = clampString(char.stats.factionRank, 48, 'Cidadão');
  const jobId = sanitizeId(char.stats.jobId || 'desempregado', 48, 'desempregado');
  const safeDistrict = clampString(district, 64, 'Centro & Baixa');

  const charPath = `characters/${characterId}`;
  const charRef = doc(db, 'characters', characterId);

  let charSnap;
  try {
    charSnap = await getDoc(charRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, charPath);
  }

  if (!charSnap.exists()) {
    try {
      await setDoc(charRef, {
        characterId,
        ownerId: uid,
        name,
        surname,
        idNumber,
        level,
        cashKz,
        bankKz,
        factionId,
        factionRank,
        jobId,
        district: safeDistrict,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, charPath);
    }
  } else {
    try {
      await updateDoc(charRef, {
        name,
        surname,
        idNumber,
        level,
        cashKz,
        bankKz,
        factionId,
        factionRank,
        jobId,
        district: safeDistrict,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, charPath);
    }
  }

  const lbPath = `leaderboard/${characterId}`;
  const lbRef = doc(db, 'leaderboard', characterId);
  const fullName = clampString(`${name} ${surname}`, 80, name);
  const netWorthKz = Number(clampNumber(cashKz + bankKz, 0, 20_000_000_000).toFixed(2));
  const jobsCompleted = Math.round(clampNumber(char.counters?.jobsCompleted ?? char.completedJobsCount ?? 0, 0, 1_000_000));

  let lbSnap;
  try {
    lbSnap = await getDoc(lbRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, lbPath);
  }

  if (!lbSnap.exists()) {
    try {
      await setDoc(lbRef, {
        characterId,
        ownerId: uid,
        name: fullName,
        level,
        netWorthKz,
        jobsCompleted,
        factionId,
        isPublic: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, lbPath);
    }
  } else {
    try {
      await updateDoc(lbRef, {
        name: fullName,
        level,
        netWorthKz,
        jobsCompleted,
        factionId,
        isPublic: true,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, lbPath);
    }
  }
}

export interface CloudLeaderboardItem {
  id: string;
  name: string;
  level: number;
  netWorthKz: number;
  jobsCompleted: number;
  factionId: string;
}

export async function fetchFirestoreLeaderboard(maxRows = 15): Promise<CloudLeaderboardItem[]> {
  const path = 'leaderboard';
  try {
    const q = query(collection(db, path), where('isPublic', '==', true), limit(50));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: String(data.characterId || d.id),
          name: String(data.name || 'Cidadão'),
          level: Number(data.level || 1),
          netWorthKz: Number(data.netWorthKz || 0),
          jobsCompleted: Number(data.jobsCompleted || 0),
          factionId: String(data.factionId || 'civil'),
        };
      })
      .sort((a, b) => b.netWorthKz - a.netWorthKz)
      .slice(0, maxRows);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export interface CloudCharacterItem {
  characterId: string;
  name: string;
  surname: string;
  level: number;
  cashKz: number;
  bankKz: number;
  district: string;
}

export function subscribeUserCharactersCloud(
  uid: string,
  onData: (items: CloudCharacterItem[]) => void
): () => void {
  const safeUid = sanitizeId(uid, 128);
  const path = 'characters';
  const q = query(collection(db, path), where('ownerId', '==', safeUid), limit(20));

  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          characterId: String(data.characterId || d.id),
          name: String(data.name || ''),
          surname: String(data.surname || ''),
          level: Number(data.level || 1),
          cashKz: Number(data.cashKz || 0),
          bankKz: Number(data.bankKz || 0),
          district: String(data.district || 'Centro & Baixa'),
        };
      });
      onData(rows);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}
