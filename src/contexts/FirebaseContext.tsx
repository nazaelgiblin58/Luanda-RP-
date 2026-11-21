/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, describeFirestoreError, googleProvider } from '../firebase';

interface FirebaseContextValue {
  firebaseUser: User | null;
  authReady: boolean;
  firebaseError: string | null;
  clearFirebaseError: () => void;
  signInWithGoogle: () => Promise<User>;
  signOutFirebase: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextValue>({
  firebaseUser: null,
  authReady: false,
  firebaseError: null,
  clearFirebaseError: () => {},
  signInWithGoogle: async () => {
    throw new Error('FirebaseProvider não inicializado.');
  },
  signOutFirebase: async () => {},
});

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(
      auth,
      (user) => {
        setFirebaseUser(user);
        setAuthReady(true);
      },
      (err) => {
        setFirebaseError(describeFirestoreError(err));
        setAuthReady(true);
      }
    );
    return () => unsub();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setFirebaseError(null);
    const cred = await signInWithPopup(auth, googleProvider);
    setFirebaseUser(cred.user);
    return cred.user;
  }, []);

  const signOutFirebase = useCallback(async () => {
    try {
      await signOut(auth);
      setFirebaseUser(null);
    } catch {}
  }, []);

  const clearFirebaseError = useCallback(() => setFirebaseError(null), []);

  return (
    <FirebaseContext.Provider
      value={{
        firebaseUser,
        authReady,
        firebaseError,
        clearFirebaseError,
        signInWithGoogle,
        signOutFirebase,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export function useFirebase(): FirebaseContextValue {
  return useContext(FirebaseContext);
}
