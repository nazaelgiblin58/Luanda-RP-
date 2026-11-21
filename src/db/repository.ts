/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { eq } from 'drizzle-orm';
import { isSqlConfigured, sqlDb } from './index.ts';
import {
  characters,
  properties,
  transactions,
  users,
  vehicles,
  worldSnapshots,
} from './schema.ts';
import type { LuandaDatabase } from '../../server/db.ts';

const WORLD_SNAPSHOT_ID = 'main';

function safeBigInt(val: unknown, fallback = 0): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  const r = Math.round(n);
  if (r > 9_000_000_000_000_000) return 9_000_000_000_000_000;
  if (r < -9_000_000_000_000_000) return -9_000_000_000_000_000;
  return r;
}

function safeInt32(val: unknown, fallback = 0): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  const r = Math.round(n);
  if (r > 2_000_000_000) return 2_000_000_000;
  if (r < -2_000_000_000) return -2_000_000_000;
  return r;
}

export async function getOrCreateSqlUser(uid: string, accountId: string, email: string, role = 'player', bannedUntil = 0) {
  if (!isSqlConfigured()) return null;
  try {
    const result = await sqlDb
      .insert(users)
      .values({
        uid,
        accountId,
        email,
        role,
        bannedUntil,
      })
      .onConflictDoUpdate({
        target: users.accountId,
        set: {
          uid,
          email,
          role,
          bannedUntil,
        },
      })
      .returning();
    return result[0] || null;
  } catch (error) {
    console.error('[Cloud SQL] Failed to upsert user:', error);
    throw new Error('Falha ao sincronizar conta na base de dados.', { cause: error });
  }
}

export async function loadWorldSnapshotFromSql(): Promise<Partial<LuandaDatabase> | null> {
  if (!isSqlConfigured()) return null;
  try {
    const rows = await sqlDb
      .select()
      .from(worldSnapshots)
      .where(eq(worldSnapshots.id, WORLD_SNAPSHOT_ID))
      .limit(1);
    if (!rows.length || !rows[0].state || typeof rows[0].state !== 'object') {
      return null;
    }
    return rows[0].state as Partial<LuandaDatabase>;
  } catch (error) {
    console.error('[Cloud SQL] Failed to load world snapshot:', error);
    throw new Error('Falha ao carregar estado do mundo da base de dados.', { cause: error });
  }
}

async function runInBatches<T>(items: T[], batchSize: number, fn: (item: T) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(fn));
  }
}

export async function syncWorldSnapshotToSql(snapshot: LuandaDatabase): Promise<void> {
  if (!isSqlConfigured()) return;
  try {
    await sqlDb
      .insert(worldSnapshots)
      .values({
        id: WORLD_SNAPSHOT_ID,
        state: snapshot as unknown as Record<string, unknown>,
      })
      .onConflictDoUpdate({
        target: worldSnapshots.id,
        set: {
          state: snapshot as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        },
      });

    const accountsList = Object.values(snapshot.accounts);
    const charsList = Object.values(snapshot.characters);
    const vehiclesList = Object.values(snapshot.vehicles);
    const propsList = snapshot.properties || [];
    const recentTxs = (snapshot.transactions || []).slice(0, 25);

    await Promise.all([
      runInBatches(accountsList, 15, (acc) =>
        sqlDb
          .insert(users)
          .values({
            uid: acc.id,
            accountId: acc.id,
            email: acc.email,
            role: acc.role,
            bannedUntil: safeBigInt(acc.bannedUntil, 0),
          })
          .onConflictDoUpdate({
            target: users.accountId,
            set: {
              email: acc.email,
              role: acc.role,
              bannedUntil: safeBigInt(acc.bannedUntil, 0),
            },
          })
      ),
      runInBatches(charsList, 15, (ch) =>
        sqlDb
          .insert(characters)
          .values({
            id: ch.id,
            accountId: ch.accountId,
            name: ch.stats.name,
            surname: ch.stats.surname,
            bi: ch.stats.idNumber,
            phone: ch.stats.phone,
            cashKz: safeBigInt(ch.stats.cashKz, 0),
            bankKz: safeBigInt(ch.stats.bankKz, 0),
            level: safeInt32(ch.stats.level, 1),
            factionId: ch.stats.factionId ?? null,
            jobId: ch.stats.jobId ?? null,
            statsJson: ch.stats as unknown as Record<string, unknown>,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: characters.id,
            set: {
              name: ch.stats.name,
              surname: ch.stats.surname,
              cashKz: safeBigInt(ch.stats.cashKz, 0),
              bankKz: safeBigInt(ch.stats.bankKz, 0),
              level: safeInt32(ch.stats.level, 1),
              factionId: ch.stats.factionId ?? null,
              jobId: ch.stats.jobId ?? null,
              statsJson: ch.stats as unknown as Record<string, unknown>,
              updatedAt: new Date(),
            },
          })
      ),
      runInBatches(vehiclesList, 15, (veh) =>
        sqlDb
          .insert(vehicles)
          .values({
            id: veh.id,
            ownerId: veh.ownerId,
            modelId: veh.modelId,
            name: veh.name,
            plate: veh.plate,
            color: veh.color,
            fuel: safeInt32(veh.fuel, 100),
            health: safeInt32(veh.health, 100),
            dataJson: veh as unknown as Record<string, unknown>,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: vehicles.id,
            set: {
              color: veh.color,
              fuel: safeInt32(veh.fuel, 100),
              health: safeInt32(veh.health, 100),
              dataJson: veh as unknown as Record<string, unknown>,
              updatedAt: new Date(),
            },
          })
      ),
      runInBatches(propsList, 20, (prop) =>
        sqlDb
          .insert(properties)
          .values({
            id: prop.id,
            name: prop.name,
            district: prop.district,
            ownerId: prop.ownerId ?? null,
            renterId: prop.renterId ?? null,
            priceKz: safeBigInt(prop.priceKz, 0),
            unpaidBillsKz: safeBigInt(prop.unpaidBillsKz, 0),
            dataJson: prop as unknown as Record<string, unknown>,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: properties.id,
            set: {
              ownerId: prop.ownerId ?? null,
              renterId: prop.renterId ?? null,
              unpaidBillsKz: safeBigInt(prop.unpaidBillsKz, 0),
              dataJson: prop as unknown as Record<string, unknown>,
              updatedAt: new Date(),
            },
          })
      ),
      recentTxs.length > 0
        ? sqlDb
            .insert(transactions)
            .values(
              recentTxs.map((tx) => ({
                id: tx.id,
                characterId: tx.characterId,
                type: tx.type,
                amountKz: safeBigInt(tx.amountKz, 0),
                description: tx.description,
              }))
            )
            .onConflictDoNothing({ target: transactions.id })
        : Promise.resolve(),
    ]);
  } catch (error) {
    console.error('[Cloud SQL] Failed to sync world state:', error);
    throw new Error('Falha ao persistir estado na base de dados.', { cause: error });
  }
}
