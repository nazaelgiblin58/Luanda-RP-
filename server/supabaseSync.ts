/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LuandaDatabase, AccountRecord, CharacterRecord } from './db.ts';
import type { OwnedVehicleRecord, PropertyRecord, InventoryItem } from '../src/game/types.ts';
import { getSupabaseAdminClient, isSupabaseDbSyncConfigured } from './supabaseAdmin.ts';

function resolveHierarchyRoleLabel(rankName: string, isLeader: boolean, rankLevel: number, totalRanks: number): string {
  if (isLeader || rankLevel >= totalRanks) return 'Líder';
  const lower = rankName.toLowerCase();
  if (lower.includes('sublíder') || lower.includes('sublider') || lower.includes('inspector') || lower.includes('subdiretor') || lower.includes('defensor')) {
    return 'Sublíder';
  }
  if (lower.includes('coronel')) return 'Coronel';
  if (lower.includes('sargento') || lower.includes('subchefe') || lower.includes('enfermeiro') || lower.includes('associado')) {
    return 'Sargento';
  }
  return 'Membro';
}

function safeBigInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const r = Math.round(n);
  if (r > 9_000_000_000_000_000) return 9_000_000_000_000_000;
  if (r < -9_000_000_000_000_000) return -9_000_000_000_000_000;
  return r;
}

export async function syncSnapshotToSupabase(db: LuandaDatabase): Promise<void> {
  if (!isSupabaseDbSyncConfigured()) return;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const nowIso = new Date().toISOString();

  // 1. Perfis ligados a auth.users (com proteção contra utilizadores removidos do Auth)
  const validAuthUids = new Set<string>();
  try {
    const { data: usersPage } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of usersPage?.users || []) {
      if (u.id) validAuthUids.add(u.id);
    }
  } catch {}

  const profileRows = Object.values(db.accounts)
    .filter((acc) => Boolean(acc.supabaseUid) && (validAuthUids.size === 0 || validAuthUids.has(acc.supabaseUid!)))
    .map((acc) => {
      const now = Date.now();
      const status =
        acc.bannedUntil > now
          ? 'banned'
          : acc.suspendedUntil > now
            ? 'suspended'
            : acc.accountStatus || 'active';
      return {
        id: acc.supabaseUid!,
        email: acc.email,
        display_name: acc.email.split('@')[0],
        role: acc.role || 'player',
        account_status: status,
        banned_until: acc.bannedUntil > 0 ? new Date(acc.bannedUntil).toISOString() : null,
        ban_reason: acc.banReason || '',
        suspended_until: acc.suspendedUntil > 0 ? new Date(acc.suspendedUntil).toISOString() : null,
        updated_at: nowIso,
      };
    });

  if (profileRows.length > 0) {
    const { error } = await supabase.from('profiles').upsert(profileRows, { onConflict: 'id' });
    if (error) {
      // Fallback linha a linha caso algum utilizador tenha sido apagado do auth.users após a listagem
      for (const row of profileRows) {
        await supabase.from('profiles').upsert(row, { onConflict: 'id' });
      }
    }
  }

  const validProfileIds = new Set<string>();
  const { data: existingProfiles } = await supabase.from('profiles').select('id');
  for (const p of existingProfiles || []) {
    if (p?.id) validProfileIds.add(String(p.id));
  }

  // Mapa rápido accountId -> supabaseUid válido em public.profiles
  const uidByAccountId = new Map<string, string>();
  for (const acc of Object.values(db.accounts)) {
    if (acc.supabaseUid && validProfileIds.has(acc.supabaseUid)) {
      uidByAccountId.set(acc.id, acc.supabaseUid);
    }
  }

  // 2. Organizações & Facções
  const orgRows = db.factions.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    leader_id: f.leaderId,
    leader_name: f.leaderName,
    suspended: Boolean(f.suspended),
    treasury_kz: safeBigInt(f.treasuryKz || 0),
    base_district: f.baseDistrict || null,
    base_pos: f.basePos || [0, 0, 0],
    interior_id: f.interiorId || null,
    announcement: f.announcement || '',
    ranks_json: f.ranks || [],
    stash_json: f.stash || [],
    updated_at: nowIso,
  }));

  if (orgRows.length > 0) {
    const { error } = await supabase.from('organizations').upsert(orgRows, { onConflict: 'id' });
    if (error) console.warn('[Supabase] Aviso ao sincronizar organizations:', error.message);

    const factionRows = db.factions.map((f) => ({
      id: f.id,
      organization_id: f.id,
      name: f.name,
      faction_type: f.type === 'gangue' || f.type === 'crime' ? 'gangue' : 'legal',
      leader_char_id: f.leaderId,
      leader_name: f.leaderName,
      suspended: Boolean(f.suspended),
      treasury_kz: safeBigInt(f.treasuryKz || 0),
      base_district: f.baseDistrict || null,
      station_role: f.stationRole || null,
      station_name: f.stationName || null,
      updated_at: nowIso,
    }));
    const { error: facErr } = await supabase.from('factions').upsert(factionRows, { onConflict: 'id' });
    if (facErr) console.warn('[Supabase] Aviso ao sincronizar factions:', facErr.message);
  }

  // 3. Personagens & Player Stats
  const validOrgIds = new Set(db.factions.map((f) => f.id));
  const charList = Object.values(db.characters);
  const validCharIds = new Set<string>();

  if (charList.length > 0) {
    const charRows = charList.map((c) => ({
      id: c.id,
      user_id: uidByAccountId.get(c.accountId) || null,
      legacy_account_id: c.accountId,
      name: c.stats.name,
      surname: c.stats.surname,
      age: Math.round(c.stats.age || 24),
      nationality: c.stats.nationality || 'Angolana',
      gender: c.stats.gender || 'masculino',
      bi: c.stats.idNumber,
      phone: c.stats.phone,
      history: c.stats.history || '',
      cash_kz: Math.max(0, safeBigInt(c.stats.cashKz || 0)),
      bank_kz: safeBigInt(c.stats.bankKz || 0),
      loan_balance_kz: safeBigInt(c.stats.loanBalanceKz || 0),
      xp: Math.round(c.stats.xp || 0),
      level: Math.max(1, Math.round(c.stats.level || 1)),
      job_id: c.stats.jobId || null,
      job_level: Math.max(1, Math.round(c.stats.jobLevel || 1)),
      job_xp: Math.round(c.stats.jobXp || 0),
      faction_id: c.stats.factionId && validOrgIds.has(c.stats.factionId) ? c.stats.factionId : null,
      faction_rank: c.stats.factionRank || 'Civil',
      skin_preset_id: c.customization?.skinPresetId || null,
      customization_json: c.customization || {},
      home_property_id: c.stats.homePropertyId || null,
      position_json: c.position || { x: -29, y: 0, z: 58 },
      rotation_y: Number(c.rotationY || 0),
      updated_at: c.updatedAt || nowIso,
    }));

    const { error: charErr } = await supabase.from('characters').upsert(charRows, { onConflict: 'id' });
    if (charErr) {
      console.warn('[Supabase] Aviso ao sincronizar characters em lote:', charErr.message);
      for (const row of charRows) {
        const { error: rowErr } = await supabase.from('characters').upsert(row, { onConflict: 'id' });
        if (!rowErr) validCharIds.add(row.id);
      }
    } else {
      for (const row of charRows) validCharIds.add(row.id);
    }

    const syncedChars = charList.filter((c) => validCharIds.has(c.id));
    if (syncedChars.length > 0) {
      const statsRows = syncedChars.map((c) => ({
        character_id: c.id,
        user_id: uidByAccountId.get(c.accountId) || null,
        health: Math.round(c.stats.health ?? 100),
        armor: Math.round(c.stats.armor ?? 0),
        energy: Math.round(c.stats.energy ?? 100),
        hunger: Math.round(c.stats.hunger ?? 100),
        thirst: Math.round(c.stats.thirst ?? 100),
        sleep: Math.round(c.stats.sleep ?? 100),
        bleeding: Boolean(c.stats.bleeding),
        is_unconscious: Boolean(c.stats.isUnconscious),
        handcuffed: Boolean(c.stats.handcuffed),
        wanted_stars: Math.round(c.stats.wantedStars || 0),
        jail_until: safeBigInt(c.stats.jailUntil || 0),
        jail_reason: c.stats.jailReason || '',
        assigned_cell: Math.round(c.stats.assignedCell || 0),
        is_frozen: Boolean(c.stats.isFrozen),
        weapon_license_until: safeBigInt(c.stats.weaponLicenseUntil || 0),
        unpaid_fines_kz: safeBigInt(c.stats.unpaidFinesKz || 0),
        jobs_completed: Math.round(c.counters?.jobsCompleted || c.completedJobsCount || 0),
        purchases_count: Math.round(c.counters?.purchasesCount || 0),
        robberies_count: Math.round(c.counters?.robberiesCount || 0),
        heals_count: Math.round(c.counters?.healsCount || 0),
        missions_json: c.missions || [],
        achievements_json: c.achievements || [],
        updated_at: nowIso,
      }));
      const { error: stErr } = await supabase.from('player_stats').upsert(statsRows, { onConflict: 'character_id' });
      if (stErr) console.warn('[Supabase] Aviso ao sincronizar player_stats:', stErr.message);

      // 4. Inventário (upsert + limpeza de itens consumidos/largados)
      const invRows = syncedChars.flatMap((c) => {
        const uid = uidByAccountId.get(c.accountId) || null;
        return (c.inventory || []).map((item) => ({
          id: item.id,
          character_id: c.id,
          user_id: uid,
          catalog_id: item.catalogId,
          name: item.name,
          description: item.description || '',
          category: item.category,
          quantity: Math.max(0, Math.round(item.quantity || 1)),
          weight: Number(item.weight || 0.1),
          equipped: Boolean(item.equipped),
          usable: Boolean(item.usable),
          sell_price_kz: Math.round(item.sellPriceKz || 0),
          metadata_json: {},
          updated_at: nowIso,
        }));
      });
      if (invRows.length > 0) {
        const { error: invErr } = await supabase.from('player_inventory').upsert(invRows, { onConflict: 'id' });
        if (invErr) console.warn('[Supabase] Aviso ao sincronizar player_inventory:', invErr.message);
      }
      const activeInvIds = new Set(invRows.map((r) => r.id));
      const { data: existingInv } = await supabase
        .from('player_inventory')
        .select('id')
        .in('character_id', Array.from(validCharIds));
      const staleInvIds = (existingInv || []).map((r) => String(r.id)).filter((id) => !activeInvIds.has(id));
      if (staleInvIds.length > 0) {
        await supabase.from('player_inventory').delete().in('id', staleInvIds);
      }
    }
  }

  // 5. Membros de Organizações
  const memberRows = db.factions.flatMap((fac) => {
    const maxLevel = fac.ranks[fac.ranks.length - 1]?.level || fac.ranks.length;
    return fac.members
      .filter((m) => validCharIds.has(m.characterId))
      .map((m) => {
        const char = db.characters[m.characterId];
        const rankDef = fac.ranks.find((r) => r.level === m.level);
        const isLeader = fac.leaderId === m.characterId;
        return {
          id: `${fac.id}:${m.characterId}`,
          organization_id: fac.id,
          character_id: m.characterId,
          user_id: char ? uidByAccountId.get(char.accountId) || null : null,
          character_name: m.name,
          rank_name: m.rank,
          rank_level: m.level,
          hierarchy_role: resolveHierarchyRoleLabel(m.rank, isLeader, m.level, maxLevel),
          bi: m.bi || null,
          phone: m.phone || null,
          permissions_json: rankDef?.permissions || {},
          joined_at: m.joinedAt || nowIso,
          updated_at: nowIso,
        };
      });
  });
  if (memberRows.length > 0) {
    const { error: memErr } = await supabase.from('organization_members').upsert(memberRows, { onConflict: 'id' });
    if (memErr) console.warn('[Supabase] Aviso ao sincronizar organization_members:', memErr.message);
  }
  const activeMemberIds = new Set(memberRows.map((r) => r.id));
  const { data: existingMembers } = await supabase.from('organization_members').select('id');
  const staleMembers = (existingMembers || []).map((m) => String(m.id)).filter((id) => !activeMemberIds.has(id));
  if (staleMembers.length > 0) {
    await supabase.from('organization_members').delete().in('id', staleMembers);
  }

  // 6. Veículos
  const vehList = Object.values(db.vehicles).filter((v) => validCharIds.has(v.ownerId));
  if (vehList.length > 0) {
    const vehRows = vehList.map((v) => {
      const ownerChar = db.characters[v.ownerId];
      return {
        id: v.id,
        owner_char_id: v.ownerId,
        user_id: ownerChar ? uidByAccountId.get(ownerChar.accountId) || null : null,
        model_id: v.modelId,
        name: v.name,
        vehicle_type: v.type,
        plate: v.plate,
        color: v.color,
        accent_color: v.accentColor || null,
        skin_id: v.skinId || null,
        engine_level: Math.round(v.engineLevel || 1),
        suspension_level: Math.round(v.suspensionLevel || 1),
        wheel_style: v.wheelStyle || 'padrao',
        fuel: Math.round(v.fuel ?? 100),
        health: Math.round(v.health ?? 100),
        mileage_km: Number(v.mileageKm || 0),
        is_locked: Boolean(v.isLocked),
        is_stored_in_garage: Boolean(v.isStoredInGarage),
        is_impounded: Boolean(v.isImpounded),
        fines_kz: Math.round(v.finesKz || 0),
        is_rental: Boolean(v.isRental),
        rented_until: v.rentedUntil || null,
        position_json: v.position || {},
        rotation_y: Number(v.rotationY || 0),
        updated_at: nowIso,
      };
    });
    const { error: vehErr } = await supabase.from('player_vehicles').upsert(vehRows, { onConflict: 'id' });
    if (vehErr) console.warn('[Supabase] Aviso ao sincronizar player_vehicles:', vehErr.message);
  }
  const activeVehIds = new Set(vehList.map((v) => v.id));
  const { data: existingVehs } = await supabase.from('player_vehicles').select('id');
  const staleVehIds = (existingVehs || []).map((v) => String(v.id)).filter((id) => !activeVehIds.has(id));
  if (staleVehIds.length > 0) {
    await supabase.from('player_vehicles').delete().in('id', staleVehIds);
  }

  // 7. Propriedades
  if (db.properties.length > 0) {
    const propRows = db.properties.map((p) => {
      const ownerChar = p.ownerId && validCharIds.has(p.ownerId) ? db.characters[p.ownerId] : undefined;
      const renterChar = p.renterId && validCharIds.has(p.renterId) ? db.characters[p.renterId] : undefined;
      return {
        id: p.id,
        name: p.name,
        property_type: p.type,
        category: p.category || p.type,
        district: p.district,
        owner_char_id: ownerChar ? ownerChar.id : null,
        owner_user_id: ownerChar ? uidByAccountId.get(ownerChar.accountId) || null : null,
        owner_name: p.ownerName || null,
        renter_char_id: renterChar ? renterChar.id : null,
        renter_user_id: renterChar ? uidByAccountId.get(renterChar.accountId) || null : null,
        renter_name: p.renterName || null,
        price_kz: safeBigInt(p.priceKz || 0),
        rent_kz: safeBigInt(p.rentKz || 0),
        safe_kz: safeBigInt(p.safeKz || 0),
        unpaid_bills_kz: safeBigInt(p.unpaidBillsKz || 0),
        bills_json: p.bills || {},
        shared_keys_json: p.sharedKeys || [],
        stash_json: p.stash || [],
        employees_json: p.employees || [],
        position_json: p.position || [0, 0, 0],
        updated_at: nowIso,
      };
    });
    const { error: propErr } = await supabase.from('player_properties').upsert(propRows, { onConflict: 'id' });
    if (propErr) console.warn('[Supabase] Aviso ao sincronizar player_properties:', propErr.message);
  }

  // 8. Transações recentes
  const recentTxs = db.transactions.slice(0, 120).filter((t) => validCharIds.has(t.characterId));
  if (recentTxs.length > 0) {
    const txRows = recentTxs.map((t) => {
      const ch = db.characters[t.characterId];
      return {
        id: t.id,
        character_id: t.characterId,
        user_id: ch ? uidByAccountId.get(ch.accountId) || null : null,
        tx_type: t.type,
        amount_kz: safeBigInt(t.amountKz || 0),
        description: t.description,
        created_at: t.timestamp || nowIso,
      };
    });
    const { error: txErr } = await supabase
      .from('player_money_transactions')
      .upsert(txRows, { onConflict: 'id', ignoreDuplicates: true });
    if (txErr) console.warn('[Supabase] Aviso ao sincronizar player_money_transactions:', txErr.message);
  }

  // 9. Registos Admin Logs
  const recentLogs = db.adminLogs.slice(0, 120);
  if (recentLogs.length > 0) {
    const logRows = recentLogs.map((l) => {
      const actorAcc = Object.values(db.accounts).find((a) => a.email === l.actorEmail);
      const actorUid = actorAcc?.supabaseUid && validProfileIds.has(actorAcc.supabaseUid) ? actorAcc.supabaseUid : null;
      return {
        id: l.id,
        actor_user_id: actorUid,
        actor_email: l.actorEmail,
        actor_role: l.actorRole,
        action: l.action,
        target_id: null,
        details: l.details,
        created_at: l.timestamp || nowIso,
      };
    });
    const { error: logErr } = await supabase
      .from('admin_logs')
      .upsert(logRows, { onConflict: 'id', ignoreDuplicates: true });
    if (logErr) console.warn('[Supabase] Aviso ao sincronizar admin_logs:', logErr.message);
  }
}

export async function loadSnapshotFromSupabase(base: LuandaDatabase): Promise<Partial<LuandaDatabase> | null> {
  if (!isSupabaseDbSyncConfigured()) return null;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const [profRes, orgRes, memRes, charRes, stRes, invRes, vehRes, propRes, txRes, logRes] = await Promise.all([
    supabase.from('profiles').select('*'),
    supabase.from('organizations').select('*'),
    supabase.from('organization_members').select('*'),
    supabase.from('characters').select('*'),
    supabase.from('player_stats').select('*'),
    supabase.from('player_inventory').select('*'),
    supabase.from('player_vehicles').select('*'),
    supabase.from('player_properties').select('*'),
    supabase.from('player_money_transactions').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(200),
  ]);

  if (profRes.error || charRes.error) return null;
  const hasAnyProfiles = (profRes.data || []).length > 0;
  const hasAnyChars = (charRes.data || []).length > 0;
  if (!hasAnyProfiles && !hasAnyChars) return null;

  const accounts: Record<string, AccountRecord> = {};
  const accountIdByUid = new Map<string, string>();

  for (const p of profRes.data || []) {
    const accId = `acc-sb-${String(p.id).slice(0, 12)}`;
    accountIdByUid.set(String(p.id), accId);
    accounts[accId] = {
      id: accId,
      email: String(p.email).toLowerCase(),
      supabaseUid: String(p.id),
      accountStatus: (p.account_status || 'active') as AccountRecord['accountStatus'],
      passwordHash: '',
      recoveryCode: '',
      role: (p.role || 'player') as AccountRecord['role'],
      bannedUntil: p.banned_until ? new Date(p.banned_until).getTime() : 0,
      banReason: String(p.ban_reason || ''),
      suspendedUntil: p.suspended_until ? new Date(p.suspended_until).getTime() : 0,
      createdAt: p.created_at || new Date().toISOString(),
    };
  }

  const statsByCharId = new Map<string, Record<string, unknown>>();
  for (const s of stRes.data || []) {
    statsByCharId.set(String(s.character_id), s as Record<string, unknown>);
  }

  const invByCharId = new Map<string, InventoryItem[]>();
  for (const i of invRes.data || []) {
    const cid = String(i.character_id);
    const list = invByCharId.get(cid) || [];
    list.push({
      id: String(i.id),
      catalogId: String(i.catalog_id),
      name: String(i.name),
      description: String(i.description || ''),
      category: i.category as InventoryItem['category'],
      quantity: Number(i.quantity || 1),
      weight: Number(i.weight || 0.1),
      equipped: Boolean(i.equipped),
      usable: Boolean(i.usable),
      sellPriceKz: Number(i.sell_price_kz || 0),
    });
    invByCharId.set(cid, list);
  }

  const characters: Record<string, CharacterRecord> = {};
  for (const c of charRes.data || []) {
    const cid = String(c.id);
    const st = statsByCharId.get(cid) || {};
    const accId =
      (c.user_id && accountIdByUid.get(String(c.user_id))) ||
      String(c.legacy_account_id || '') ||
      `acc-orphan-${cid}`;
    if (c.legacy_account_id && c.user_id && accounts[accId]) {
      // Keep canonical mapping via legacy_account_id if needed
      accountIdByUid.set(String(c.user_id), accId);
    }
    characters[cid] = {
      id: cid,
      accountId: accId,
      stats: {
        name: String(c.name),
        surname: String(c.surname),
        age: Number(c.age || 24),
        nationality: String(c.nationality || 'Angolana'),
        gender: (c.gender || 'masculino') as CharacterRecord['stats']['gender'],
        idNumber: String(c.bi),
        phone: String(c.phone),
        history: String(c.history || ''),
        cashKz: Number(c.cash_kz || 0),
        bankKz: Number(c.bank_kz || 0),
        loanBalanceKz: Number(c.loan_balance_kz || 0),
        xp: Number(c.xp || 0),
        level: Number(c.level || 1),
        jobId: c.job_id || null,
        jobLevel: Number(c.job_level || 1),
        jobXp: Number(c.job_xp || 0),
        factionId: c.faction_id || null,
        factionRank: String(c.faction_rank || 'Civil'),
        homePropertyId: c.home_property_id || null,
        health: Number(st.health ?? 100),
        armor: Number(st.armor ?? 0),
        energy: Number(st.energy ?? 100),
        hunger: Number(st.hunger ?? 100),
        thirst: Number(st.thirst ?? 100),
        sleep: Number(st.sleep ?? 100),
        bleeding: Boolean(st.bleeding),
        isUnconscious: Boolean(st.is_unconscious),
        handcuffed: Boolean(st.handcuffed),
        wantedStars: Number(st.wanted_stars || 0),
        jailUntil: Number(st.jail_until || 0),
        jailReason: String(st.jail_reason || ''),
        assignedCell: Number(st.assigned_cell || 0),
        isFrozen: Boolean(st.is_frozen),
        weaponLicenseUntil: Number(st.weapon_license_until || 0),
        unpaidFinesKz: Number(st.unpaid_fines_kz || 0),
      },
      customization: (c.customization_json || {}) as CharacterRecord['customization'],
      inventory: invByCharId.get(cid) || [],
      jobStepIndex: 0,
      activeJobStartedAt: 0,
      completedJobsCount: Number(st.jobs_completed || 0),
      counters: {
        jobsCompleted: Number(st.jobs_completed || 0),
        purchasesCount: Number(st.purchases_count || 0),
        robberiesCount: Number(st.robberies_count || 0),
        healsCount: Number(st.heals_count || 0),
      },
      missions: (Array.isArray(st.missions_json) ? st.missions_json : []) as CharacterRecord['missions'],
      achievements: (Array.isArray(st.achievements_json) ? st.achievements_json : []) as string[],
      position: (c.position_json || { x: -29, y: 0, z: 58 }) as CharacterRecord['position'],
      rotationY: Number(c.rotation_y || 0),
      updatedAt: c.updated_at || new Date().toISOString(),
    };
  }

  const orgMap = new Map<string, Record<string, unknown>>();
  for (const o of orgRes.data || []) orgMap.set(String(o.id), o as Record<string, unknown>);

  const membersByOrg = new Map<string, LuandaDatabase['factions'][number]['members']>();
  for (const m of memRes.data || []) {
    const oid = String(m.organization_id);
    const list = membersByOrg.get(oid) || [];
    list.push({
      characterId: String(m.character_id),
      name: String(m.character_name),
      rank: String(m.rank_name),
      level: Number(m.rank_level || 1),
      bi: m.bi ? String(m.bi) : undefined,
      phone: m.phone ? String(m.phone) : undefined,
      joinedAt: m.joined_at || new Date().toISOString(),
    });
    membersByOrg.set(oid, list);
  }

  const factions = base.factions.map((fac) => {
    const row = orgMap.get(fac.id);
    if (!row) return fac;
    return {
      ...fac,
      leaderId: (row.leader_id as string | null) ?? fac.leaderId,
      leaderName: String(row.leader_name || fac.leaderName),
      suspended: Boolean(row.suspended),
      treasuryKz: Number(row.treasury_kz ?? fac.treasuryKz),
      announcement: String(row.announcement ?? fac.announcement),
      ranks: Array.isArray(row.ranks_json) && row.ranks_json.length > 0 ? (row.ranks_json as typeof fac.ranks) : fac.ranks,
      stash: Array.isArray(row.stash_json) ? (row.stash_json as typeof fac.stash) : fac.stash,
      members: membersByOrg.get(fac.id) || [],
    };
  });

  const vehicles: Record<string, OwnedVehicleRecord> = {};
  for (const v of vehRes.data || []) {
    vehicles[String(v.id)] = {
      id: String(v.id),
      ownerId: String(v.owner_char_id),
      modelId: String(v.model_id),
      name: String(v.name),
      type: v.vehicle_type as OwnedVehicleRecord['type'],
      plate: String(v.plate),
      color: String(v.color),
      accentColor: v.accent_color || undefined,
      skinId: v.skin_id || undefined,
      engineLevel: Number(v.engine_level || 1),
      suspensionLevel: Number(v.suspension_level || 1),
      wheelStyle: (v.wheel_style || 'padrao') as OwnedVehicleRecord['wheelStyle'],
      fuel: Number(v.fuel ?? 100),
      health: Number(v.health ?? 100),
      mileageKm: Number(v.mileage_km || 0),
      isLocked: Boolean(v.is_locked),
      isStoredInGarage: Boolean(v.is_stored_in_garage),
      isImpounded: Boolean(v.is_impounded),
      finesKz: Number(v.fines_kz || 0),
      isRental: Boolean(v.is_rental),
      rentedUntil: v.rented_until ? Number(v.rented_until) : undefined,
      position: (v.position_json || undefined) as OwnedVehicleRecord['position'],
      rotationY: Number(v.rotation_y || 0),
    };
  }

  const propMap = new Map<string, Record<string, unknown>>();
  for (const p of propRes.data || []) propMap.set(String(p.id), p as Record<string, unknown>);
  const properties: PropertyRecord[] = base.properties.map((p) => {
    const row = propMap.get(p.id);
    if (!row) return p;
    return {
      ...p,
      ownerId: (row.owner_char_id as string | null) ?? null,
      ownerName: (row.owner_name as string | null) ?? null,
      renterId: (row.renter_char_id as string | null) ?? null,
      renterName: (row.renter_name as string | null) ?? null,
      safeKz: Number(row.safe_kz ?? p.safeKz ?? 0),
      unpaidBillsKz: Number(row.unpaid_bills_kz ?? p.unpaidBillsKz ?? 0),
      bills: (row.bills_json || p.bills) as PropertyRecord['bills'],
      sharedKeys: (Array.isArray(row.shared_keys_json) ? row.shared_keys_json : p.sharedKeys) as string[],
      stash: (Array.isArray(row.stash_json) ? row.stash_json : p.stash) as InventoryItem[],
      employees: (Array.isArray(row.employees_json) ? row.employees_json : p.employees) as PropertyRecord['employees'],
    };
  });

  const transactions = (txRes.data || []).map((t) => ({
    id: String(t.id),
    characterId: String(t.character_id),
    type: String(t.tx_type) as LuandaDatabase['transactions'][number]['type'],
    amountKz: Number(t.amount_kz || 0),
    description: String(t.description || ''),
    timestamp: String(t.created_at || new Date().toISOString()),
  }));

  const adminLogs = (logRes.data || []).map((l) => ({
    id: String(l.id),
    actorEmail: String(l.actor_email || ''),
    actorRole: (l.actor_role || 'admin_god') as AccountRecord['role'],
    action: String(l.action || ''),
    details: String(l.details || ''),
    timestamp: String(l.created_at || new Date().toISOString()),
  }));

  return {
    accounts,
    characters,
    factions,
    vehicles,
    properties,
    transactions,
    adminLogs,
  };
}
