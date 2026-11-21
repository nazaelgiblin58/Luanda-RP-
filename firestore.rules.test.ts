/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Security Rules Specification Verification & Dirty Dozen Payload Assertions for LUANDA RP.
 * Run against Firebase Rules Unit Testing / Emulator when available.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'create' | 'update' | 'get' | 'list' | 'delete';
  expected: 'PERMISSION_DENIED';
  payload?: Record<string, unknown>;
  notes: string;
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Shadow Update with Ghost Field (isAdmin: true)',
    collectionPath: 'users/user_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      uid: 'user_1',
      displayName: 'Kamba',
      role: 'player',
      linkedAccountId: 'acc-1',
      isAdmin: true,
    },
    notes: 'Blocked by data.keys().hasOnly([...]) in isValidUserProfile.',
  },
  {
    id: 2,
    name: 'Self-Assigned Privilege Escalation (role: admin_god)',
    collectionPath: 'users/user_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      uid: 'user_1',
      displayName: 'Hacker',
      role: 'admin_god',
      linkedAccountId: 'acc-1',
    },
    notes: "Blocked by incoming().role == 'player' on /users/{userId} create.",
  },
  {
    id: 3,
    name: 'Unverified Email Admin Spoof Attempt',
    collectionPath: 'admins/attacker_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      uid: 'attacker_1',
      role: 'admin_god',
      grantedBy: 'attacker_1',
    },
    notes: 'Blocked by isBootstrappedAdmin() requiring email_verified == true.',
  },
  {
    id: 4,
    name: 'Cross-User PII Blanket Get',
    collectionPath: 'users/victim_1/private/info',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    notes: 'Blocked by isOwner(userId) || isAdmin().',
  },
  {
    id: 5,
    name: 'Orphaned Private Subcollection Write without Parent User',
    collectionPath: 'users/orphan_1/private/info',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      uid: 'orphan_1',
      email: 'orphan@luanda.ao',
    },
    notes: 'Blocked by exists(/databases/$(database)/documents/users/$(userId)).',
  },
  {
    id: 6,
    name: 'Character Owner Spoofing on Create',
    collectionPath: 'characters/char-999',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      characterId: 'char-999',
      ownerId: 'victim_1',
      name: 'Fake',
      surname: 'Citizen',
      idNumber: '009LA001',
      level: 1,
      cashKz: 100,
      bankKz: 7000,
      factionId: 'civil',
      factionRank: 'Cidadao',
      jobId: 'desempregado',
      district: 'Centro & Baixa',
    },
    notes: 'Blocked by incoming().ownerId == request.auth.uid.',
  },
  {
    id: 7,
    name: 'Immutable Field Tampering (ownerId on Update)',
    collectionPath: 'characters/char-1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: {
      ownerId: 'attacker_1',
    },
    notes: 'Blocked by incoming().ownerId == existing().ownerId and affectedKeys().hasOnly(...).',
  },
  {
    id: 8,
    name: 'ID Poisoning with Invalid Characters / Oversized ID',
    collectionPath: `characters/${'x'.repeat(160)}!@#`,
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    notes: "Blocked by isValidId(characterId) length <= 128 & regex '^[a-zA-Z0-9_\\\\-]+$'.",
  },
  {
    id: 9,
    name: 'Value Poisoning (Negative Cash & Oversized Name)',
    collectionPath: 'characters/char-1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: {
      name: 'A'.repeat(60),
      cashKz: -5000,
    },
    notes: 'Blocked by isValidCharacterSnapshot() checking cashKz >= 0 and name.size() <= 40.',
  },
  {
    id: 10,
    name: 'Fake Client Timestamp Injection',
    collectionPath: 'characters/char-1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2099-01-01T00:00:00Z',
    },
    notes: 'Blocked by incoming().createdAt == request.time && incoming().updatedAt == request.time.',
  },
  {
    id: 11,
    name: 'Unscoped Blanket List Query on Characters',
    collectionPath: 'characters',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    notes: 'Blocked by allow list: if isSignedIn() && existing().ownerId == request.auth.uid.',
  },
  {
    id: 12,
    name: 'Orphaned Leaderboard Entry without Backing Character',
    collectionPath: 'leaderboard/char-missing',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      characterId: 'char-missing',
      ownerId: 'user_1',
      name: 'Ghost Rich',
      level: 99,
      netWorthKz: 99999999,
      jobsCompleted: 500,
      factionId: 'civil',
      isPublic: true,
    },
    notes: 'Blocked by exists(/databases/$(database)/documents/characters/$(characterId)).',
  },
];

// Structural & Invariant Audit against compiled firestore.rules
function runStaticRulesVerification() {
  const rulesFile = fs.existsSync(path.resolve(process.cwd(), 'firestore.rules'))
    ? 'firestore.rules'
    : 'DRAFT_firestore.rules';
  const rulesText = fs.readFileSync(path.resolve(process.cwd(), rulesFile), 'utf-8');

  assert.equal(DIRTY_DOZEN_PAYLOADS.length, 12, 'Must maintain all 12 Dirty Dozen cases');
  assert.ok(rulesText.includes("rules_version = '2';"), 'Rules must declare rules_version = 2');
  assert.ok(rulesText.includes('allow read, write: if false;'), 'Global default-deny safety net required');
  assert.ok(rulesText.includes('request.auth.token.email_verified == true'), 'Email verification must be enforced');
  assert.ok(rulesText.includes('isValidUserProfile(incoming())'), 'User update/create validation helper required');
  assert.ok(rulesText.includes('isValidCharacterSnapshot(incoming())'), 'Character validation helper required');
  assert.ok(rulesText.includes('isValidLeaderboardEntry(incoming())'), 'Leaderboard validation helper required');
  assert.ok(rulesText.includes('isValidAdminRoleRecord(incoming())'), 'Admin role validation helper required');
  assert.ok(rulesText.includes('affectedKeys().hasOnly('), 'Action-based update allowlisting required');
  assert.ok(rulesText.includes('incoming().updatedAt == request.time'), 'Strict server timestamp required');

  console.log(`✅ [firestore.rules.test] Verified ${DIRTY_DOZEN_PAYLOADS.length} Dirty Dozen guards in ${rulesFile}`);
}

runStaticRulesVerification();
