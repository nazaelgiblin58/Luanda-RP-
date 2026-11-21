/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { relations } from 'drizzle-orm';
import { bigint, integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  accountId: text('account_id').notNull().unique(),
  email: text('email').notNull(),
  role: text('role').notNull().default('player'),
  bannedUntil: bigint('banned_until', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const characters = pgTable('characters', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  name: text('name').notNull(),
  surname: text('surname').notNull(),
  bi: text('bi').notNull(),
  phone: text('phone').notNull(),
  cashKz: bigint('cash_kz', { mode: 'number' }).notNull().default(100),
  bankKz: bigint('bank_kz', { mode: 'number' }).notNull().default(7000),
  level: integer('level').notNull().default(1),
  factionId: text('faction_id'),
  jobId: text('job_id'),
  statsJson: jsonb('stats_json').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const vehicles = pgTable('vehicles', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  modelId: text('model_id').notNull(),
  name: text('name').notNull(),
  plate: text('plate').notNull(),
  color: text('color').notNull(),
  fuel: integer('fuel').notNull().default(100),
  health: integer('health').notNull().default(100),
  dataJson: jsonb('data_json').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const properties = pgTable('properties', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  district: text('district').notNull(),
  ownerId: text('owner_id'),
  renterId: text('renter_id'),
  priceKz: bigint('price_kz', { mode: 'number' }).notNull(),
  unpaidBillsKz: bigint('unpaid_bills_kz', { mode: 'number' }).notNull().default(0),
  dataJson: jsonb('data_json').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const transactions = pgTable('transactions', {
  id: text('id').primaryKey(),
  characterId: text('character_id').notNull(),
  type: text('type').notNull(),
  amountKz: bigint('amount_kz', { mode: 'number' }).notNull(),
  description: text('description').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const worldSnapshots = pgTable('world_snapshots', {
  id: text('id').primaryKey(),
  state: jsonb('state').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  characters: many(characters),
}));

export const charactersRelations = relations(characters, ({ one, many }) => ({
  account: one(users, {
    fields: [characters.accountId],
    references: [users.accountId],
  }),
  vehicles: many(vehicles),
  transactions: many(transactions),
}));

export const vehiclesRelations = relations(vehicles, ({ one }) => ({
  owner: one(characters, {
    fields: [vehicles.ownerId],
    references: [characters.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  character: one(characters, {
    fields: [transactions.characterId],
    references: [characters.id],
  }),
}));
