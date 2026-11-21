/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const tmpDbPath = path.join(os.tmpdir(), `luandarp_test_${Date.now()}.json`);
process.env.LUANDA_TEST_MODE = '1';
process.env.LUANDA_DB_PATH = tmpDbPath;
process.env.ADMIN_EMAIL = 'nazaelgiblin58@gmail.com';
process.env.AUTH_SECRET = 'luanda-rp-test-secret-key-2026-angola';

async function runTests() {
  const { createLuandaServer } = await import('../server');
  const { getDb, resetDbForTests, saveDb } = await import('../server/db');
  const { checkSingleClientAfk } = await import('../server/wsHandler');
  const { MORRO_DEFINITIONS, PRISON_RELEASE_POS, getSurfaceHeightAt, getVehicleSlopeAngles } = await import(
    '../src/game/city/terrainPhysics'
  );

  resetDbForTests();
  const { server, wss } = createLuandaServer();

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  assert(addr && typeof addr === 'object', 'Server address missing');
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  const wsBaseUrl = `ws://127.0.0.1:${addr.port}/ws`;

  const req = async <T = any>(
    method: string,
    urlPath: string,
    body?: any,
    token?: string
  ): Promise<{ status: number; data: T }> => {
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json()) as T;
    return { status: res.status, data };
  };

  try {
    console.log('1. Testando Registo, Login e Recuperação de Palavra-passe...');
    const p1Email = 'cidadao1@luanda.ao';
    const reg1 = await req('POST', '/api/auth/register', { email: p1Email, password: 'Password123' });
    assert.equal(reg1.status, 200);
    assert.ok(reg1.data.token);
    assert.ok(reg1.data.recoveryCode);
    assert.equal(reg1.data.account.role, 'player');

    const rec = await req('POST', '/api/auth/recover', {
      email: p1Email,
      recoveryCode: reg1.data.recoveryCode,
      newPassword: 'NewPassword456',
    });
    assert.equal(rec.status, 200);
    assert.equal(rec.data.ok, true);

    const login1 = await req('POST', '/api/auth/login', { email: p1Email, password: 'NewPassword456' });
    assert.equal(login1.status, 200);
    const token1 = login1.data.token as string;

    const p2Email = 'cidadao2@luanda.ao';
    const reg2 = await req('POST', '/api/auth/register', { email: p2Email, password: 'Password123' });
    assert.equal(reg2.status, 200);
    const token2 = reg2.data.token as string;

    const adminEmail = 'nazaelgiblin58@gmail.com';
    const regAdmin = await req('POST', '/api/auth/register', { email: adminEmail, password: 'AdminSecretPassword99' });
    assert.equal(regAdmin.status, 200);
    assert.equal(regAdmin.data.account.role, 'admin_god');
    const adminToken = regAdmin.data.token as string;

    console.log('2. Testando Criação de Personagens, Aparência & Persistência em Disco...');
    const c1Res = await req(
      'POST',
      '/api/characters',
      {
        name: 'Kiluanje',
        surname: 'Neto',
        age: 26,
        nationality: 'Angolana',
        gender: 'masculino',
        history: 'Jovem empreendedor da Maianga.',
        customization: { shirtColor: '#eab308', pantsColor: '#111827' },
      },
      token1
    );
    assert.equal(c1Res.status, 200);
    const char1 = c1Res.data.character;
    assert.equal(char1.stats.cashKz, 100);
    assert.equal(char1.stats.bankKz, 7000);
    assert.equal(char1.position.x, -29);
    assert.equal(char1.position.z, 58);

    const c2Res = await req(
      'POST',
      '/api/characters',
      {
        name: 'Nzinga',
        surname: 'Mendes',
        age: 24,
        nationality: 'Angolana',
        gender: 'feminino',
      },
      token2
    );
    assert.equal(c2Res.status, 200);
    const char2 = c2Res.data.character;
    assert.equal(char2.stats.cashKz, 100);
    assert.equal(char2.stats.bankKz, 7000);

    const appUpd = await req(
      'PATCH',
      `/api/characters/${char1.id}/appearance`,
      { customization: { pantsColor: '#dc2626' } },
      token1
    );
    assert.equal(appUpd.status, 200);
    assert.equal(appUpd.data.character.customization.pantsColor, '#dc2626');

    // Reload DB from disk to verify persistence
    resetDbForTests();
    const list1 = await req('GET', '/api/characters', undefined, token1);
    assert.equal(list1.status, 200);
    assert.equal(list1.data.characters.length, 1);
    assert.equal(list1.data.characters[0].customization.pantsColor, '#dc2626');

    console.log('3. Testando Economia, Multicaixa Express, Transferência e Rejeição de Saldo Negativo...');
    const wd = await req('POST', '/api/bank/action', { characterId: char1.id, action: 'withdraw', amount: 2500 }, token1);
    assert.equal(wd.status, 200);
    assert.equal(wd.data.character.stats.cashKz, 2600);
    assert.equal(wd.data.character.stats.bankKz, 4500);

    const dep = await req('POST', '/api/bank/action', { characterId: char1.id, action: 'deposit', amount: 500 }, token1);
    assert.equal(dep.status, 200);
    assert.equal(dep.data.character.stats.cashKz, 2100);
    assert.equal(dep.data.character.stats.bankKz, 5000);

    const badWd = await req('POST', '/api/bank/action', { characterId: char1.id, action: 'withdraw', amount: 999999 }, token1);
    assert.equal(badWd.status, 400);

    const trf = await req(
      'POST',
      '/api/bank/action',
      { characterId: char1.id, action: 'transfer', amount: 4000, targetPhoneOrBi: char2.stats.phone },
      token1
    );
    assert.equal(trf.status, 200);

    const c2Get = await req('GET', `/api/characters/${char2.id}`, undefined, token2);
    assert.equal(c2Get.data.character.stats.bankKz, 7000 + 4000);

    console.log('4. Testando Lojas, Inventário, Drop 3D e Recolha...');
    const buyFood = await req(
      'POST',
      '/api/shop/buy',
      { characterId: char1.id, catalogId: 'funge_calulu', quantity: 1, payWith: 'cash' },
      token1
    );
    assert.equal(buyFood.status, 200);
    const boughtItem = buyFood.data.character.inventory.find((i: any) => i.catalogId === 'funge_calulu');
    assert.ok(boughtItem);

    const dropRes = await req(
      'POST',
      '/api/inventory/action',
      { characterId: char1.id, itemId: boughtItem.id, action: 'drop', x: 5, z: 12 },
      token1
    );
    assert.equal(dropRes.status, 200);
    assert.equal(dropRes.data.droppedItems.length, 1);
    const dropId = dropRes.data.droppedItems[0].id;

    const pickupRes = await req('POST', '/api/world/pickup', { characterId: char2.id, dropId }, token2);
    assert.equal(pickupRes.status, 200);
    assert.equal(pickupRes.data.droppedItems.length, 0);
    assert.ok(pickupRes.data.character.inventory.some((i: any) => i.catalogId === 'funge_calulu'));

    console.log('5. Testando Compra de Viatura, Pintura, Tuning de Motor e Tranca...');
    const adminGiveForVehicle = await req(
      'POST',
      '/api/admin/action',
      { action: 'give_money', targetCharId: char1.id, amountKz: 140000 },
      adminToken
    );
    assert.equal(adminGiveForVehicle.status, 200);

    const buyCar = await req(
      'POST',
      '/api/vehicles/buy',
      { characterId: char1.id, modelId: 'candongueiro_hiace', color: '#2563eb' },
      token1
    );
    assert.equal(buyCar.status, 200);
    const veh = buyCar.data.vehicle;
    assert.ok(veh.plate.startsWith('LD-'));

    const paintRes = await req(
      'POST',
      `/api/vehicles/${veh.id}/action`,
      { characterId: char1.id, action: 'paint', color: '#dc2626', wheelStyle: 'desportiva' },
      token1
    );
    assert.equal(paintRes.status, 200);
    assert.equal(paintRes.data.vehicle.color, '#dc2626');
    assert.equal(paintRes.data.vehicle.wheelStyle, 'desportiva');

    const tuneRes = await req(
      'POST',
      `/api/vehicles/${veh.id}/action`,
      { characterId: char1.id, action: 'upgrade_engine' },
      token1
    );
    assert.equal(tuneRes.status, 200);
    assert.equal(tuneRes.data.vehicle.engineLevel, 2);

    const lockRes = await req(
      'POST',
      `/api/vehicles/${veh.id}/action`,
      { characterId: char1.id, action: 'lock' },
      token1
    );
    assert.equal(lockRes.status, 200);
    assert.equal(lockRes.data.vehicle.isLocked, true);

    await req(
      'POST',
      '/api/admin/action',
      { action: 'give_money', targetCharId: char1.id, amountKz: 2000000 },
      adminToken
    );

    const buyPosterCar = await req(
      'POST',
      '/api/vehicles/buy',
      { characterId: char1.id, modelId: 'bmw_m4', skinId: 'bmw_m4_purple' },
      token1
    );
    assert.equal(buyPosterCar.status, 200);
    assert.equal(buyPosterCar.data.vehicle.skinId, 'bmw_m4_purple');
    assert.equal(buyPosterCar.data.vehicle.accentColor, '#9333ea');

    const reskinPosterCar = await req(
      'POST',
      `/api/vehicles/${buyPosterCar.data.vehicle.id}/action`,
      { characterId: char1.id, action: 'paint', skinId: 'supra_cyan_kanji' },
      token1
    );
    assert.equal(reskinPosterCar.status, 200);
    assert.equal(reskinPosterCar.data.vehicle.skinId, 'supra_cyan_kanji');
    assert.equal(reskinPosterCar.data.vehicle.color, '#06b6d4');
    assert.equal(reskinPosterCar.data.vehicle.accentColor, '#09090b');

    console.log('6. Testando Empregos Jogáveis Oficiais (Proximidade 3D + Conclusão de Turno -> Kz + XP + Log)...');
    const oldJobRejected = await req('POST', '/api/jobs/start', { characterId: char1.id, jobId: 'entregador' }, token1);
    assert.equal(oldJobRejected.status, 404, 'Emprego legado entregador deve estar desativado');

    const jobStart = await req('POST', '/api/jobs/start', { characterId: char1.id, jobId: 'yango' }, token1);
    assert.equal(jobStart.status, 200);
    const jobSteps = jobStart.data.job.steps as { pos: [number, number, number]; radius: number; label: string }[];
    const tooFarStep = await req(
      'POST',
      '/api/jobs/step-complete',
      { characterId: char1.id, position: { x: 400, z: 400 } },
      token1
    );
    assert.equal(tooFarStep.status, 400);

    let finalStep: any = null;
    for (let i = 0; i < jobSteps.length; i++) {
      finalStep = await req(
        'POST',
        '/api/jobs/step-complete',
        { characterId: char1.id, position: { x: jobSteps[i].pos[0], z: jobSteps[i].pos[2] } },
        token1
      );
      assert.equal(finalStep.status, 200);
    }
    assert.equal(finalStep.data.completedTurn, true);
    assert.ok(finalStep.data.payout > 0);
    assert.ok(finalStep.data.character.stats.xp > 0);
    assert.ok(finalStep.data.jobWorkLogs.length >= 1);

    console.log('7. Testando Polícia CAD, Multa, Prisão em Cela Real, Fiança, Hospital INEMA e Cooldown de Assalto...');
    const joinPol = await req(
      'POST',
      '/api/factions/action',
      { characterId: char2.id, factionId: 'policia', action: 'join' },
      token2
    );
    assert.equal(joinPol.status, 200);
    const polOrgAfterJoin = (joinPol.data.factions as any[]).find((f) => f.id === 'policia');
    assert.equal(polOrgAfterJoin.leaderId, null, 'Entrar numa organização não pode auto-promover a Líder');

    const fineRes = await req(
      'POST',
      '/api/justice/action',
      { characterId: char2.id, action: 'fine', targetCharId: char1.id, amountKz: 2500, reason: 'Excesso de velocidade' },
      token2
    );
    assert.equal(fineRes.status, 200);

    const warrantRes = await req(
      'POST',
      '/api/justice/action',
      { characterId: char2.id, action: 'warrant', targetCharId: char1.id, reason: 'Fuga à PNA' },
      token2
    );
    assert.equal(warrantRes.status, 200);
    assert.ok(warrantRes.data.warrants.length >= 1);

    const arrestRes = await req(
      'POST',
      '/api/justice/action',
      { characterId: char2.id, action: 'arrest', targetCharId: char1.id, minutes: 2, reason: 'Mandado ativo' },
      token2
    );
    assert.equal(arrestRes.status, 200);
    const jailedCharCheck = await req('GET', `/api/characters/${char1.id}`, undefined, token1);
    assert.ok(jailedCharCheck.data.character.stats.assignedCell >= 1);
    assert.ok(jailedCharCheck.data.character.position.x >= 885 && jailedCharCheck.data.character.position.x <= 915);
    assert.ok(jailedCharCheck.data.character.position.z >= 620 && jailedCharCheck.data.character.position.z <= 660);

    const bailRes = await req('POST', '/api/justice/action', { characterId: char1.id, action: 'pay_bail' }, token1);
    assert.equal(bailRes.status, 200);
    assert.equal(bailRes.data.character.stats.jailUntil, 0);

    const treatRes = await req('POST', '/api/hospital/action', { characterId: char1.id, action: 'self_treat' }, token1);
    assert.equal(treatRes.status, 200);
    assert.equal(treatRes.data.character.stats.health, 100);

    // Buy lockpick for robbery test + verify cooldown 429
    const buyLockpick = await req(
      'POST',
      '/api/shop/buy',
      { characterId: char1.id, catalogId: 'gazua_rp', quantity: 1, payWith: 'bank' },
      token1
    );
    assert.equal(buyLockpick.status, 200);

    const rob1 = await req(
      'POST',
      '/api/crime/action',
      { characterId: char1.id, action: 'rob_store', targetId: 'loja_viana' },
      token1
    );
    assert.equal(rob1.status, 200);
    assert.ok(rob1.data.reward > 0);

    const rob2 = await req(
      'POST',
      '/api/crime/action',
      { characterId: char1.id, action: 'rob_store', targetId: 'loja_viana' },
      token1
    );
    assert.equal(rob2.status, 429);

    console.log('8. Testando Compra de Propriedade/Empresa, Cofre e Lucro...');
    const propsRes = await req('GET', '/api/properties');
    assert.equal(propsRes.status, 200);
    const biz = propsRes.data.properties.find((p: any) => p.type === 'business');
    assert.ok(biz);

    await req(
      'POST',
      '/api/admin/action',
      { action: 'give_money', targetCharId: char1.id, amountKz: biz.priceKz + 50000 },
      adminToken
    );

    const buyProp = await req('POST', `/api/properties/${biz.id}/action`, { characterId: char1.id, action: 'buy' }, token1);
    assert.equal(buyProp.status, 200);

    const safeDep = await req(
      'POST',
      `/api/properties/${biz.id}/action`,
      { characterId: char1.id, action: 'safe_deposit', amountKz: 2000 },
      token1
    );
    assert.equal(safeDep.status, 200);
    const safeWd = await req(
      'POST',
      `/api/properties/${biz.id}/action`,
      { characterId: char1.id, action: 'safe_withdraw', amountKz: 1000 },
      token1
    );
    assert.equal(safeWd.status, 200);

    const collectRev = await req(
      'POST',
      `/api/properties/${biz.id}/action`,
      { characterId: char1.id, action: 'collect_revenue' },
      token1
    );
    assert.equal(collectRev.status, 200);
    const bizAfterRev = (collectRev.data.properties as any[]).find((p) => p.id === biz.id);
    assert.ok(bizAfterRev?.bills && bizAfterRev.bills.endeKz >= 450, 'Lucro empresarial deveria registar fatura ENDE em prop.bills.endeKz');

    console.log('9. Testando Segurança RBAC Admin God...');
    const nonAdminOverview = await req('GET', '/api/admin/overview', undefined, token1);
    assert.equal(nonAdminOverview.status, 403);

    const nonAdminAction = await req(
      'POST',
      '/api/admin/action',
      { action: 'give_money', targetCharId: char1.id, amountKz: 100000 },
      token1
    );
    assert.equal(nonAdminAction.status, 403);

    const adminOverview = await req('GET', '/api/admin/overview', undefined, adminToken);
    assert.equal(adminOverview.status, 200);
    assert.equal(adminOverview.data.myRole, 'admin_god');

    const adminHeal = await req('POST', '/api/admin/action', { action: 'heal', targetCharId: char1.id }, adminToken);
    assert.equal(adminHeal.status, 200);

    const adminWorld = await req(
      'POST',
      '/api/admin/action',
      { action: 'world', weather: 'chuva_tropical', timeOfDay: 20.5, timeSpeed: 1 },
      adminToken
    );
    assert.equal(adminWorld.status, 200);
    assert.equal(adminWorld.data.worldConfig.weather, 'chuva_tropical');

    // Ban and verify login blocked
    const p2AccId = reg2.data.account.id;
    const banRes = await req(
      'POST',
      '/api/admin/action',
      { action: 'ban', targetAccountId: p2AccId, hours: 1, reason: 'Teste de segurança RP' },
      adminToken
    );
    assert.equal(banRes.status, 200);
    const bannedLogin = await req('POST', '/api/auth/login', { email: p2Email, password: 'Password123' });
    assert.equal(bannedLogin.status, 403);

    // Unban p2 so p2 can join WebSocket test
    const unbanRes = await req('POST', '/api/admin/action', { action: 'unban', targetAccountId: p2AccId }, adminToken);
    assert.equal(unbanRes.status, 200);

    console.log('10. Testando 2 Clientes WebSocket Simultâneos (Join, Posição & Chat RP /me)...');
    await req(
      'POST',
      '/api/admin/action',
      { action: 'teleport', targetCharId: char2.id, x: 195, z: 115 },
      adminToken
    );
    const ws1 = new WebSocket(`${wsBaseUrl}?token=${encodeURIComponent(token1)}`);
    const ws2 = new WebSocket(`${wsBaseUrl}?token=${encodeURIComponent(token2)}`);

    const ws1Msgs: any[] = [];
    const ws2Msgs: any[] = [];
    ws1.on('message', (d) => ws1Msgs.push(JSON.parse(d.toString())));
    ws2.on('message', (d) => ws2Msgs.push(JSON.parse(d.toString())));

    await Promise.all([
      new Promise<void>((res) => ws1.once('open', () => res())),
      new Promise<void>((res) => ws2.once('open', () => res())),
    ]);

    ws1.send(
      JSON.stringify({
        type: 'join',
        token: token1,
        characterId: char1.id,
        position: { x: 10, y: 0, z: 10 },
      })
    );

    await new Promise((r) => setTimeout(r, 120));

    ws2.send(
      JSON.stringify({
        type: 'join',
        token: token2,
        characterId: char2.id,
        position: { x: 12, y: 0, z: 12 },
      })
    );

    await new Promise((r) => setTimeout(r, 180));

    assert.ok(ws1Msgs.some((m) => m.type === 'init'), 'ws1 did not receive init');
    assert.ok(ws2Msgs.some((m) => m.type === 'init'), 'ws2 did not receive init');
    assert.ok(
      ws1Msgs.some((m) => m.type === 'player_joined' && m.player.id === char2.id),
      'ws1 did not see char2 join'
    );

    // Position broadcast (caminhada legítima a partir da posição atual de char1 em [194, 114])
    ws1.send(
      JSON.stringify({
        type: 'update',
        position: { x: 196, y: 0, z: 116 },
        rotationY: 1.2,
        animState: 'walk',
        isDriving: false,
      })
    );
    await new Promise((r) => setTimeout(r, 120));
    assert.ok(
      ws2Msgs.some((m) => m.type === 'player_updated' && m.id === char1.id && m.position.x === 196),
      'ws2 did not receive player_updated from ws1'
    );

    // RP /me chat broadcast
    ws1.send(
      JSON.stringify({
        type: 'chat',
        text: '/me acena para os cidadãos da Baixa de Luanda',
        channel: 'geral',
        position: { x: 196, y: 0, z: 116 },
      })
    );
    await new Promise((r) => setTimeout(r, 120));
    const rpBubble = ws2Msgs.find((m) => m.type === 'chat_received' && m.message?.channel === 'rp');
    assert.ok(rpBubble, 'ws2 did not receive /me RP chat');
    assert.ok(rpBubble.message.text.includes('Kiluanje Neto'));

    // Geral chat broadcast
    ws2.send(
      JSON.stringify({
        type: 'chat',
        text: 'Bom dia Angola!',
        channel: 'geral',
        position: { x: 12, y: 0, z: 12 },
      })
    );
    await new Promise((r) => setTimeout(r, 120));
    const geralMsg = ws1Msgs.find(
      (m) => m.type === 'chat_received' && m.message?.channel === 'geral' && m.message?.text === 'Bom dia Angola!'
    );
    assert.ok(geralMsg, 'ws1 did not receive geral chat');

    ws1.close();
    ws2.close();

    console.log('11. Testando Estritamente 6 Organizações (3 Legais + 3 Gangues), Combate PvP e Descanso/Baú...');
    const facRes = await req('GET', '/api/factions');
    assert.equal(facRes.status, 200);
    const facIds = (facRes.data.factions as any[]).map((f) => f.id);
    assert.equal(facIds.length, 6, 'Devem existir estritamente 6 organizações oficiais');
    for (const reqFac of ['policia', 'hospital', 'advogados', 'cv_vianalandia', 'ftx_caop2', 'bmr_matanga']) {
      assert.ok(facIds.includes(reqFac), `Organização esperada em falta: ${reqFac}`);
    }
    for (const removedFac of ['faa', 'tcp_maltarichie', 'vagos_benga']) {
      assert.equal(facIds.includes(removedFac), false, `Organização removida não deve existir: ${removedFac}`);
    }

    // Sem Porte de Arma -> 403 obrigatório
    const buyPistolDenied = await req(
      'POST',
      '/api/shop/buy',
      { characterId: char1.id, catalogId: 'pistola_9mm', quantity: 1, payWith: 'bank' },
      token1
    );
    assert.equal(buyPistolDenied.status, 403);

    getDb().characters[char1.id].stats.bankKz += 60000;
    const licRes = await req(
      'POST',
      '/api/justice/action',
      { characterId: char1.id, action: 'buy_weapon_license', payWith: 'bank' },
      token1
    );
    assert.equal(licRes.status, 200);

    const buyPistol = await req(
      'POST',
      '/api/shop/buy',
      { characterId: char1.id, catalogId: 'pistola_9mm', quantity: 1, payWith: 'bank' },
      token1
    );
    assert.equal(buyPistol.status, 200);
    const pistolItem = buyPistol.data.character.inventory.find((i: any) => i.catalogId === 'pistola_9mm');
    assert.ok(pistolItem, 'Pistola 9mm deveria estar no inventário após compra');

    const equipPistol = await req(
      'POST',
      '/api/inventory/action',
      { characterId: char1.id, itemId: pistolItem.id, action: 'equip' },
      token1
    );
    assert.equal(equipPistol.status, 200);
    assert.equal(equipPistol.data.character.customization.equippedWeapon, 'pistola_9mm');

    const combatHit = await req(
      'POST',
      '/api/combat/hit',
      { characterId: char1.id, targetCharId: char2.id, damage: 24, weaponId: 'pistola_9mm' },
      token1
    );
    assert.equal(combatHit.status, 200);
    assert.equal(combatHit.data.ok, true);
    assert.equal(combatHit.data.targetHealth, 76);

    const restProp = await req(
      'POST',
      `/api/properties/${biz.id}/action`,
      { characterId: char1.id, action: 'rest' },
      token1
    );
    assert.equal(restProp.status, 200);
    assert.equal(restProp.data.character.stats.energy, 100);

    const waterItem = restProp.data.character.inventory.find((i: any) => i.catalogId === 'agua_pura');
    assert.ok(waterItem, 'Item água inicial deveria existir para testar baú');

    const stashStore = await req(
      'POST',
      `/api/properties/${biz.id}/action`,
      { characterId: char1.id, action: 'stash_store', itemId: waterItem.id },
      token1
    );
    assert.equal(stashStore.status, 200);
    const updatedBiz = (stashStore.data.properties as any[]).find((p) => p.id === biz.id);
    assert.ok(updatedBiz?.stash?.length >= 1, 'Baú da propriedade deveria conter o item guardado');
    const stashedItem = updatedBiz.stash.find((s: any) => s.catalogId === 'agua_pura');
    assert.ok(stashedItem);

    const stashTake = await req(
      'POST',
      `/api/properties/${biz.id}/action`,
      { characterId: char1.id, action: 'stash_take', itemId: stashedItem.id },
      token1
    );
    assert.equal(stashTake.status, 200);
    const bizAfterTake = (stashTake.data.properties as any[]).find((p) => p.id === biz.id);
    assert.equal(bizAfterTake.stash.some((s: any) => s.catalogId === 'agua_pura'), false);

    console.log('12. Testando Ameaça/Assalto a Cidadão (rob_npc) e Detenção Automática PNA (police_capture)...');
    const threatNpc = await req(
      'POST',
      '/api/crime/action',
      { characterId: char1.id, action: 'rob_npc', mode: 'threat', npcLabel: 'Morador Maianga' },
      token1
    );
    assert.equal(threatNpc.status, 200);
    assert.ok(threatNpc.data.character.stats.wantedStars >= 1);

    const cashBeforeRob = threatNpc.data.character.stats.cashKz as number;
    const robNpc = await req(
      'POST',
      '/api/crime/action',
      { characterId: char1.id, action: 'rob_npc', mode: 'rob', npcLabel: 'Executivo Ingombota' },
      token1
    );
    assert.equal(robNpc.status, 200);
    assert.ok(robNpc.data.reward > 0);
    assert.equal(robNpc.data.character.stats.cashKz, cashBeforeRob + robNpc.data.reward);
    assert.ok(robNpc.data.character.stats.wantedStars >= 2);

    const captureRes = await req(
      'POST',
      '/api/crime/action',
      { characterId: char1.id, action: 'police_capture', reason: 'Capturado pela PNA após assalto' },
      token1
    );
    assert.equal(captureRes.status, 200);
    assert.ok(captureRes.data.jailSeconds >= 45);
    assert.ok(captureRes.data.character.stats.jailUntil > Date.now());
    assert.equal(captureRes.data.character.stats.wantedStars, 0);
    assert.ok(captureRes.data.character.stats.assignedCell >= 1 && captureRes.data.character.stats.assignedCell <= 4);
    assert.ok(captureRes.data.character.position.x >= 885 && captureRes.data.character.position.x <= 915);
    assert.ok(captureRes.data.character.position.z >= 620 && captureRes.data.character.position.z <= 660);

    // Libertar char1 via fiança para continuar os testes seguintes
    await req('POST', '/api/justice/action', { characterId: char1.id, action: 'pay_bail' }, token1);

    console.log('13. Testando Controlo Exclusivo Admin God nas Organizações & Hierarquia...');
    const nonAdminOrgGet = await req('GET', '/api/admin/organizations', undefined, token1);
    assert.equal(nonAdminOrgGet.status, 403);
    const nonAdminOrgPost = await req(
      'POST',
      '/api/admin/organizations',
      { action: 'appoint_leader', factionId: 'ftx_caop2', targetCharId: char1.id },
      token1
    );
    assert.equal(nonAdminOrgPost.status, 403);

    const appointLeader = await req(
      'POST',
      '/api/admin/organizations',
      { action: 'appoint_leader', factionId: 'ftx_caop2', targetCharId: char2.id },
      adminToken
    );
    assert.equal(appointLeader.status, 200);
    assert.equal(appointLeader.data.faction.leaderId, char2.id);

    const char1JoinFtx = await req(
      'POST',
      '/api/factions/action',
      { characterId: char1.id, factionId: 'ftx_caop2', action: 'join' },
      token1
    );
    assert.equal(char1JoinFtx.status, 200);
    const ftxAfterJoin = (char1JoinFtx.data.factions as any[]).find((f) => f.id === 'ftx_caop2');
    assert.equal(ftxAfterJoin.leaderId, char2.id);

    const subTryPromote = await req(
      'POST',
      '/api/factions/manage',
      { characterId: char1.id, factionId: 'ftx_caop2', action: 'promote', targetCharId: char2.id },
      token1
    );
    assert.equal(subTryPromote.status, 403);

    const leaderSetRank = await req(
      'POST',
      '/api/factions/manage',
      { characterId: char2.id, factionId: 'ftx_caop2', action: 'set_rank', targetCharId: char1.id, rankLevel: 3 },
      token2
    );
    assert.equal(leaderSetRank.status, 200);
    assert.equal(leaderSetRank.data.faction.members.find((m: any) => m.characterId === char1.id).level, 3);

    const leaderSub = await req(
      'POST',
      '/api/factions/manage',
      { characterId: char2.id, factionId: 'ftx_caop2', action: 'appoint_subleader', targetCharId: char1.id },
      token2
    );
    assert.equal(leaderSub.status, 200);

    const leaderAnnounce = await req(
      'POST',
      '/api/factions/manage',
      { characterId: char2.id, factionId: 'ftx_caop2', action: 'edit_announcement', announcement: 'Patrulha no Morro às 21h.' },
      token2
    );
    assert.equal(leaderAnnounce.status, 200);
    assert.equal(leaderAnnounce.data.faction.announcement, 'Patrulha no Morro às 21h.');

    const suspendFtx = await req(
      'POST',
      '/api/admin/organizations',
      { action: 'suspend_org', factionId: 'ftx_caop2' },
      adminToken
    );
    assert.equal(suspendFtx.status, 200);
    assert.equal(suspendFtx.data.faction.suspended, true);

    const joinSuspended = await req(
      'POST',
      '/api/factions/action',
      { characterId: char1.id, factionId: 'ftx_caop2', action: 'join' },
      token1
    );
    assert.equal(joinSuspended.status, 403);

    const reactivateFtx = await req(
      'POST',
      '/api/admin/organizations',
      { action: 'reactivate_org', factionId: 'ftx_caop2' },
      adminToken
    );
    assert.equal(reactivateFtx.status, 200);
    assert.equal(reactivateFtx.data.faction.suspended, false);

    const removeLeaderRes = await req(
      'POST',
      '/api/admin/organizations',
      { action: 'remove_leader', factionId: 'ftx_caop2' },
      adminToken
    );
    assert.equal(removeLeaderRes.status, 200);
    assert.equal(removeLeaderRes.data.faction.leaderId, null);

    console.log('14. Testando 18 Casas (>= 700.000 Kz), Chaves Partilhadas, Residência e Rotina (Dormir/Cozinhar/Banho)...');
    const allProps = await req('GET', '/api/properties');
    assert.equal(allProps.status, 200);
    const houses = (allProps.data.properties as any[]).filter((p) => p.type !== 'business');
    assert.ok(houses.length >= 18, `Esperadas >= 18 casas, encontradas ${houses.length}`);
    assert.ok(houses.every((h) => h.priceKz >= 700000), 'Todas as casas devem custar >= 700.000 Kz');
    assert.ok(houses.every((h) => h.position[0] >= -34), 'Nenhuma casa pode estar no oceano (x < -34)');
    assert.ok(houses.filter((h) => h.inCondominio).length >= 10, 'Devem existir >= 10 casas no Condomínio Vila Atlântica');

    const targetHouse = houses[0];
    await req(
      'POST',
      '/api/admin/action',
      { action: 'give_money', targetCharId: char1.id, amountKz: targetHouse.priceKz + 200000 },
      adminToken
    );
    const buyHouse = await req(
      'POST',
      `/api/properties/${targetHouse.id}/action`,
      { characterId: char1.id, action: 'buy' },
      token1
    );
    assert.equal(buyHouse.status, 200);
    assert.equal(buyHouse.data.character.stats.homePropertyId, targetHouse.id);

    const addKeyRes = await req(
      'POST',
      `/api/properties/${targetHouse.id}/action`,
      { characterId: char1.id, action: 'add_key', targetCharId: char2.id },
      token1
    );
    assert.equal(addKeyRes.status, 200);

    const setHome2 = await req(
      'POST',
      `/api/properties/${targetHouse.id}/action`,
      { characterId: char2.id, action: 'set_home' },
      token2
    );
    assert.equal(setHome2.status, 200);
    assert.equal(setHome2.data.character.stats.homePropertyId, targetHouse.id);

    const restHouse = await req(
      'POST',
      `/api/properties/${targetHouse.id}/action`,
      { characterId: char2.id, action: 'rest' },
      token2
    );
    assert.equal(restHouse.status, 200);
    assert.equal(restHouse.data.character.stats.sleep, 100);
    assert.equal(restHouse.data.character.stats.energy, 100);

    const cookHouse = await req(
      'POST',
      `/api/properties/${targetHouse.id}/action`,
      { characterId: char2.id, action: 'cook_eat' },
      token2
    );
    assert.equal(cookHouse.status, 200);
    assert.equal(cookHouse.data.character.stats.hunger, 100);

    const bathHouse = await req(
      'POST',
      `/api/properties/${targetHouse.id}/action`,
      { characterId: char2.id, action: 'hygiene' },
      token2
    );
    assert.equal(bathHouse.status, 200);

    const removeKeyRes = await req(
      'POST',
      `/api/properties/${targetHouse.id}/action`,
      { characterId: char1.id, action: 'remove_key', targetCharId: char2.id },
      token1
    );
    assert.equal(removeKeyRes.status, 200);
    const restDenied = await req(
      'POST',
      `/api/properties/${targetHouse.id}/action`,
      { characterId: char2.id, action: 'rest' },
      token2
    );
    assert.equal(restDenied.status, 403);

    console.log('15. Testando Desativação do Hotel (HTTP 410) e Casas Exclusivas no Condomínio...');
    const hotelList = await req('GET', '/api/hotel');
    assert.equal(hotelList.status, 410);
    const hotelActionRes = await req(
      'POST',
      '/api/hotel/action',
      { characterId: char1.id, action: 'checkin', roomNumber: 1, days: 1 },
      token1
    );
    assert.equal(hotelActionRes.status, 410);

    const condPropsRes = await req('GET', '/api/properties');
    assert.equal(condPropsRes.status, 200);
    const allHouses = (condPropsRes.data.properties as any[]).filter((p) => p.type !== 'business');
    assert.ok(allHouses.length >= 6);
    assert.ok(allHouses.every((h) => h.inCondominio === true && h.district === 'condominio'));

    console.log('16. Testando AFK 72m -> Prisão 5h Persistente & Libertação Automática Pós-Pena...');
    const dbRef = getDb();
    const fakeWsClient: any = {
      id: 'afk-test-ws',
      ws: { readyState: 1, send: () => {} },
      accountId: reg1.data.account.id,
      characterId: char1.id,
      name: 'Kiluanje Neto',
      badge: 'Civil',
      role: 'player',
      position: { x: 10, y: 0, z: 10 },
      rotationY: 0,
      animState: 'idle',
      isDriving: false,
      customization: dbRef.characters[char1.id].customization,
      lastActivityAt: Date.now() - 4325 * 1000,
      lastCheckedPos: { x: 10, z: 10 },
      afkWarningStage: 0,
    };
    const afkResult = checkSingleClientAfk(fakeWsClient, dbRef, Date.now());
    assert.equal(afkResult, 'arrested');
    assert.ok(dbRef.characters[char1.id].stats.jailUntil > Date.now() + 4 * 3600 * 1000);
    assert.ok((dbRef.characters[char1.id].stats.assignedCell || 0) >= 1);

    // Simular expiração offline da pena e confirmar auto-libertação no GET /api/characters/:id
    dbRef.characters[char1.id].stats.jailUntil = Date.now() - 5000;
    await saveDb();
    const releasedChar = await req('GET', `/api/characters/${char1.id}`, undefined, token1);
    assert.equal(releasedChar.status, 200);
    assert.equal(releasedChar.data.character.stats.jailUntil, 0);
    assert.equal(releasedChar.data.character.position.x, PRISON_RELEASE_POS[0]);
    assert.equal(releasedChar.data.character.position.z, PRISON_RELEASE_POS[2]);

    console.log('17. Testando Sistema DJ Global Pago (200.000 Kz) & Sincronização...');
    await req(
      'POST',
      '/api/admin/action',
      { action: 'give_money', targetCharId: char1.id, amountKz: 250000 },
      adminToken
    );
    const djPlayRes = await req(
      'POST',
      '/api/dj/play',
      { characterId: char1.id, trackId: 'kuduro_marginal', payWith: 'bank' },
      token1
    );
    assert.equal(djPlayRes.status, 200);
    assert.equal(djPlayRes.data.djState.currentTrack.trackId, 'kuduro_marginal');
    assert.ok(djPlayRes.data.djState.endsAt > djPlayRes.data.djState.startedAt);
    assert.ok(djPlayRes.data.djState.history.length >= 1);

    const djGetRes = await req('GET', '/api/dj');
    assert.equal(djGetRes.status, 200);
    assert.equal(djGetRes.data.djState.currentTrack.trackId, 'kuduro_marginal');

    const djNoMoney = await req(
      'POST',
      '/api/dj/play',
      { characterId: char2.id, trackId: 'semba_luanda', payWith: 'cash' },
      token2
    );
    assert.equal(djNoMoney.status, 400);

    console.log('18. Testando Política, Partidos, Voto Único Imutável, Regra do Presidente Único & Decretos...');
    const nonAdminPol = await req(
      'POST',
      '/api/politics/admin',
      { action: 'create_party', name: 'Ilegal', acronym: 'ILG' },
      token1
    );
    assert.equal(nonAdminPol.status, 403);

    const pA = await req(
      'POST',
      '/api/politics/admin',
      { action: 'create_party', name: 'Movimento Luanda Nova', acronym: 'MLN', color: '#F97316' },
      adminToken
    );
    assert.equal(pA.status, 200);
    const partyAId = pA.data.politics.parties[0].id;

    const pB = await req(
      'POST',
      '/api/politics/admin',
      { action: 'create_party', name: 'Aliança Cívica de Angola', acronym: 'ACA', color: '#2563EB' },
      adminToken
    );
    assert.equal(pB.status, 200);
    const partyBId = pB.data.politics.parties[1].id;

    const openElec1 = await req(
      'POST',
      '/api/politics/admin',
      { action: 'open_election', title: 'Eleições Presidenciais Luanda 2026' },
      adminToken
    );
    assert.equal(openElec1.status, 200);

    const cand1Res = await req(
      'POST',
      '/api/politics/admin',
      { action: 'add_candidate', targetCharId: char1.id, partyId: partyAId, bio: 'Emprego e segurança.' },
      adminToken
    );
    assert.equal(cand1Res.status, 200);
    const cand1Id = cand1Res.data.politics.activeElection.candidates[0].id;

    const cand2Res = await req(
      'POST',
      '/api/politics/admin',
      { action: 'add_candidate', targetCharId: char2.id, partyId: partyBId, bio: 'Saúde e educação.' },
      adminToken
    );
    assert.equal(cand2Res.status, 200);
    const cand2Id = cand2Res.data.politics.activeElection.candidates[1].id;

    const vote1 = await req(
      'POST',
      '/api/politics/vote',
      { characterId: char1.id, candidateId: cand1Id },
      token1
    );
    assert.equal(vote1.status, 200);
    const vote1Again = await req(
      'POST',
      '/api/politics/vote',
      { characterId: char1.id, candidateId: cand2Id },
      token1
    );
    assert.equal(vote1Again.status, 400);

    const vote2 = await req(
      'POST',
      '/api/politics/vote',
      { characterId: char2.id, candidateId: cand1Id },
      token2
    );
    assert.equal(vote2.status, 200);

    const close1 = await req('POST', '/api/politics/admin', { action: 'close_election' }, adminToken);
    assert.equal(close1.status, 200);
    assert.equal(close1.data.politics.president.characterId, char1.id);

    const nonPresDecree = await req(
      'POST',
      '/api/politics/decision',
      { characterId: char2.id, title: 'Tentativa', decree: 'Sem mandato' },
      token2
    );
    assert.equal(nonPresDecree.status, 403);

    const presDecree = await req(
      'POST',
      '/api/politics/decision',
      { characterId: char1.id, title: 'Decreto N.º 1 — Segurança', decree: 'Reforço de patrulhas na Baixa.' },
      token1
    );
    assert.equal(presDecree.status, 200);
    assert.ok(presDecree.data.politics.decisions.length >= 1);

    // 2ª eleição: char2 vence -> substitui char1 (apenas 1 presidente ativo)
    await req('POST', '/api/politics/admin', { action: 'open_election', title: 'Eleições Extraordinárias' }, adminToken);
    const c2nd = await req(
      'POST',
      '/api/politics/admin',
      { action: 'add_candidate', targetCharId: char2.id, partyId: partyBId },
      adminToken
    );
    const c2ndId = c2nd.data.politics.activeElection.candidates[0].id;
    await req('POST', '/api/politics/vote', { characterId: char2.id, candidateId: c2ndId }, token2);
    const close2 = await req('POST', '/api/politics/admin', { action: 'close_election' }, adminToken);
    assert.equal(close2.status, 200);
    assert.equal(close2.data.politics.president.characterId, char2.id);

    const remPres = await req('POST', '/api/politics/admin', { action: 'remove_president' }, adminToken);
    assert.equal(remPres.status, 200);
    assert.equal(remPres.data.politics.president, null);

    console.log('19. Testando Física Contínua dos 3 Morros, Rampas e Inclinações de Veículos...');
    assert.equal(MORRO_DEFINITIONS.length, 3);
    for (const m of MORRO_DEFINITIONS) {
      let prevY = -1;
      for (let t = 0; t <= 20; t += 2) {
        let sx = m.x;
        let sz = m.z;
        if (m.rampSide === 'west') sx = m.x - 41 + t;
        else if (m.rampSide === 'north') sz = m.z - 41 + t;
        else if (m.rampSide === 'south') sz = m.z + 41 - t;
        const h = getSurfaceHeightAt(sx, sz, Math.max(0, prevY));
        assert.ok(Number.isFinite(h) && h >= 0 && h <= m.topY + 0.05);
        assert.ok(h >= prevY - 0.01, `Rampa de ${m.id} não pode afundar ao subir`);
        prevY = h;
      }
      assert.ok(Math.abs(getSurfaceHeightAt(m.x, m.z, m.topY) - m.topY) < 0.05);
      const slopes = getVehicleSlopeAngles(m.x, m.z, 0, m.topY);
      assert.ok(Number.isFinite(slopes.pitch) && Number.isFinite(slopes.roll));
    }

    console.log('20. Testando Previsão Meteorológica Dinâmica (API Luanda, Hora do Dia, Auto/Manual & Admin)...');
    const adminAutoRes = await req(
      'POST',
      '/api/admin/action',
      { action: 'world', weatherMode: 'auto', timeOfDay: 13.5, taxRate: 0.05, economyMultiplier: 1.0 },
      adminToken
    );
    assert.equal(adminAutoRes.status, 200);
    assert.equal(adminAutoRes.data.worldConfig.weatherMode, 'auto');

    const forecastDay = await req('GET', '/api/weather/forecast?timeOfDay=13.5');
    assert.equal(forecastDay.status, 200);
    assert.equal(forecastDay.data.forecast.locationName, 'Luanda, Angola');
    assert.ok(typeof forecastDay.data.forecast.current.tempC === 'number');
    assert.ok(Array.isArray(forecastDay.data.forecast.hourly) && forecastDay.data.forecast.hourly.length >= 6);

    const forecastSunset = await req('GET', '/api/weather/forecast?timeOfDay=18.2');
    assert.equal(forecastSunset.status, 200);
    assert.equal(forecastSunset.data.forecast.current.mappedWeather, 'pordosol');

    const forecastNight = await req('GET', '/api/weather/forecast?timeOfDay=22');
    assert.equal(forecastNight.status, 200);
    assert.equal(forecastNight.data.forecast.current.mappedWeather, 'noite');

    const manualHeat = await req(
      'POST',
      '/api/weather/mode',
      { mode: 'manual', weather: 'calor_extremo', timeOfDay: 14 },
      token1
    );
    assert.equal(manualHeat.status, 200);
    assert.equal(manualHeat.data.worldConfig.weatherMode, 'manual');
    assert.equal(manualHeat.data.worldConfig.weather, 'calor_extremo');

    const manualCloudy = await req(
      'POST',
      '/api/weather/mode',
      { mode: 'manual', weather: 'nublado', timeOfDay: 15 },
      token1
    );
    assert.equal(manualCloudy.status, 200);
    assert.equal(manualCloudy.data.worldConfig.weather, 'nublado');

    const backAuto = await req(
      'POST',
      '/api/weather/mode',
      { mode: 'auto', timeOfDay: 14 },
      token1
    );
    assert.equal(backAuto.status, 200);
    assert.equal(backAuto.data.worldConfig.weatherMode, 'auto');

    console.log('21. Testando Música Paga Pesquisável (Sem YouTube), Prefeitura, Fazenda/PF/Bandidos & Voz WS...');
    const searchRes = await req('GET', '/api/music/search?q=amapiano');
    assert.equal(searchRes.status, 200);
    assert.equal(searchRes.data.personalCostKz, 1500);
    assert.equal(searchRes.data.globalCostKz, 200000);
    assert.ok(Array.isArray(searchRes.data.tracks) && searchRes.data.tracks.length >= 3);

    await req(
      'POST',
      '/api/admin/action',
      { action: 'give_money', targetCharId: char1.id, amountKz: 250000 },
      adminToken
    );

    const rejectYt = await req(
      'POST',
      '/api/dj/play',
      { characterId: char1.id, youtubeUrl: 'https://youtu.be/5qap5aO4i9A', payWith: 'bank' },
      token1
    );
    assert.equal(rejectYt.status, 400);

    const beforePersonalChar = await req('GET', `/api/characters/${char1.id}`, undefined, token1);
    const bankBeforeMusic = beforePersonalChar.data.character.stats.bankKz as number;

    const personalMusicRes = await req(
      'POST',
      '/api/music/play',
      { characterId: char1.id, trackId: 'amapiano_luanda_sul', mode: 'personal', payWith: 'bank' },
      token1
    );
    assert.equal(personalMusicRes.status, 200);
    assert.equal(personalMusicRes.data.costKz, 1500);
    assert.equal(personalMusicRes.data.character.stats.bankKz, bankBeforeMusic - 1500);

    const globalMusicRes = await req(
      'POST',
      '/api/music/play',
      { characterId: char1.id, trackId: 'kuduro_viana_mix', mode: 'global', payWith: 'bank' },
      token1
    );
    assert.equal(globalMusicRes.status, 200);
    assert.equal(globalMusicRes.data.djState.currentTrack.trackId, 'kuduro_viana_mix');

    const annList = await req('GET', '/api/prefeitura/announcements');
    assert.equal(annList.status, 200);
    assert.ok(Array.isArray(annList.data.announcements));

    const annPost = await req(
      'POST',
      '/api/prefeitura/announcements',
      {
        characterId: char1.id,
        title: 'Feira Agrícola na Praça Central',
        content: 'Todos os fazendeiros podem entregar colheitas frescas na Praça de Viana.',
        category: 'evento',
      },
      token1
    );
    assert.equal(annPost.status, 200);
    assert.ok(annPost.data.announcements.some((a: any) => a.title === 'Feira Agrícola na Praça Central'));

    // Testar emprego oficial ELISAL -> checkpoints + rejeição dos empregos legados removidos
    const elisalStart = await req('POST', '/api/jobs/start', { characterId: char1.id, jobId: 'elisal' }, token1);
    assert.equal(elisalStart.status, 200);
    for (const st of elisalStart.data.job.steps) {
      const sRes = await req(
        'POST',
        '/api/jobs/step-complete',
        { characterId: char1.id, position: { x: st.pos[0], z: st.pos[2] } },
        token1
      );
      assert.equal(sRes.status, 200);
    }

    for (const removedJobId of ['fazendeiro_praca', 'agente_pf', 'bandido_operacoes']) {
      const remRes = await req('POST', '/api/jobs/start', { characterId: char1.id, jobId: removedJobId }, token1);
      assert.equal(remRes.status, 404, `Emprego legado ${removedJobId} deve estar removido`);
    }

    // Testar relay WebSocket de voz (voice_chunk) dentro de 55m de proximidade
    await req('POST', '/api/admin/action', { action: 'teleport', targetCharId: char1.id, x: 10, z: 10 }, adminToken);
    await req('POST', '/api/admin/action', { action: 'teleport', targetCharId: char2.id, x: 14, z: 12 }, adminToken);
    const vws1 = new WebSocket(`${wsBaseUrl}?token=${encodeURIComponent(token1)}`);
    const vws2 = new WebSocket(`${wsBaseUrl}?token=${encodeURIComponent(token2)}`);
    const vws2Msgs: any[] = [];
    vws2.on('message', (d) => vws2Msgs.push(JSON.parse(d.toString())));
    await Promise.all([
      new Promise<void>((res) => vws1.once('open', () => res())),
      new Promise<void>((res) => vws2.once('open', () => res())),
    ]);
    vws1.send(JSON.stringify({ type: 'join', token: token1, characterId: char1.id, position: { x: 10, y: 0, z: 10 } }));
    vws2.send(JSON.stringify({ type: 'join', token: token2, characterId: char2.id, position: { x: 14, y: 0, z: 12 } }));
    await new Promise((r) => setTimeout(r, 140));
    vws1.send(
      JSON.stringify({
        type: 'voice_chunk',
        data: 'AAAA',
        mimeType: 'audio/pcm;rate=16000',
        position: { x: 10, y: 0, z: 10 },
        channel: 'proximity',
      })
    );
    await new Promise((r) => setTimeout(r, 140));
    assert.ok(
      vws2Msgs.some(
        (m) =>
          m.type === 'voice_chunk' &&
          m.senderId === char1.id &&
          m.data === 'AAAA' &&
          m.channel === 'proximity' &&
          m.position?.x === 10
      ),
      'ws2 deveria receber o pacote de voz voice_chunk do ws1'
    );
    vws1.close();
    vws2.close();

    console.log('22. Testando Sistemas Ultimato (4 Empregos, 3 Gangues, 3 Orgs Legais, WS Veículos/Interiores & Telemetria Admin)...');
    // 22.1 YANGO
    const startYango = await req('POST', '/api/jobs/start', { characterId: char1.id, jobId: 'yango' }, token1);
    assert.equal(startYango.status, 200);
    const yangoGen = await req('POST', '/api/jobs/yango/action', { characterId: char1.id, action: 'generate_call' }, token1);
    assert.equal(yangoGen.status, 200);
    const yangoCallId = yangoGen.data.call.id;
    const yangoAcc = await req('POST', '/api/jobs/yango/action', { characterId: char1.id, action: 'accept', callId: yangoCallId }, token1);
    assert.equal(yangoAcc.status, 200);
    const yangoPick = await req('POST', '/api/jobs/yango/action', { characterId: char1.id, action: 'pickup', callId: yangoCallId }, token1);
    assert.equal(yangoPick.status, 200);
    const bankBeforeYango = yangoPick.data.character.stats.bankKz as number;
    const yangoDone = await req('POST', '/api/jobs/yango/action', { characterId: char1.id, action: 'complete', callId: yangoCallId, rating: 5 }, token1);
    assert.equal(yangoDone.status, 200);
    assert.ok(yangoDone.data.character.stats.bankKz > bankBeforeYango);

    // 22.2 ENDE (avaria + apagão + reparação)
    const startEnde = await req('POST', '/api/jobs/start', { characterId: char1.id, jobId: 'ende' }, token1);
    assert.equal(startEnde.status, 200);
    const endeGen = await req(
      'POST',
      '/api/jobs/ende/action',
      { characterId: char1.id, action: 'generate_fault', pointId: 'ende-pt-maianga', causesBlackout: true },
      token1
    );
    assert.equal(endeGen.status, 200);
    assert.ok(endeGen.data.blackoutDistricts.maianga, 'Apagão em Maianga deveria estar ativo');
    const faultId = endeGen.data.fault.id;
    const endeAcc = await req('POST', '/api/jobs/ende/action', { characterId: char1.id, action: 'accept_fault', faultId }, token1);
    assert.equal(endeAcc.status, 200);
    const endeFix = await req('POST', '/api/jobs/ende/action', { characterId: char1.id, action: 'complete_repair', faultId }, token1);
    assert.equal(endeFix.status, 200);
    assert.equal(Boolean(endeFix.data.blackoutDistricts.maianga), false, 'Energia em Maianga deveria ser restabelecida');

    // 22.3 PESCADOR (zona proibida 403 + pesca válida + venda)
    const startPescador = await req('POST', '/api/jobs/start', { characterId: char1.id, jobId: 'pescador' }, token1);
    assert.equal(startPescador.status, 200);
    const fishBlocked = await req(
      'POST',
      '/api/jobs/pescador/action',
      { characterId: char1.id, action: 'cast_catch', position: { x: -125, z: 120 } },
      token1
    );
    assert.equal(fishBlocked.status, 403, 'Pesca em perímetro restrito FAA deve ser recusada');
    const fishOk = await req(
      'POST',
      '/api/jobs/pescador/action',
      { characterId: char1.id, action: 'cast_catch', position: { x: -38, z: 16 }, bonusRoll: true },
      token1
    );
    assert.equal(fishOk.status, 200);
    assert.ok(fishOk.data.caught);
    const fishSell = await req('POST', '/api/jobs/pescador/action', { characterId: char1.id, action: 'sell_fish' }, token1);
    assert.equal(fishSell.status, 200);
    assert.ok(fishSell.data.payout > 0);

    // 22.4 ELISAL (rejeição sem recolha + recolha de contentor + melhoria limpeza + rota final)
    const startElisal = await req('POST', '/api/jobs/start', { characterId: char1.id, jobId: 'elisal' }, token1);
    assert.equal(startElisal.status, 200);
    const elisalEarlyFinish = await req('POST', '/api/jobs/elisal/action', { characterId: char1.id, action: 'finish_route' }, token1);
    assert.equal(elisalEarlyFinish.status, 400, 'ELISAL não pode concluir rota sem recolher contentor');
    const elisalStateBefore = await req('GET', '/api/jobs/elisal/state', undefined, token1);
    assert.equal(elisalStateBefore.status, 200);
    const centroCleanBefore = elisalStateBefore.data.cleanlinessByDistrict.centro as number;
    const binCollect = await req('POST', '/api/jobs/elisal/action', { characterId: char1.id, action: 'collect_bin', binId: 'bin-centro-1' }, token1);
    assert.equal(binCollect.status, 200);
    assert.ok(binCollect.data.cleanlinessByDistrict.centro >= centroCleanBefore);
    const elisalFinish = await req('POST', '/api/jobs/elisal/action', { characterId: char1.id, action: 'finish_route' }, token1);
    assert.equal(elisalFinish.status, 200);
    assert.ok(elisalFinish.data.payout > 0);

    // 22.5 3 GANGUES (CV desmanche temporizado, FTX craft + baú, BMR estufa + venda + lavagem + território temporizado)
    await req('POST', '/api/factions/action', { characterId: char1.id, factionId: 'cv_vianalandia', action: 'join' }, token1);
    const cvStart = await req('POST', '/api/gangs/cv/desmanche', { characterId: char1.id, action: 'start' }, token1);
    assert.equal(cvStart.status, 200);
    const cvSessId = cvStart.data.session.id;
    const cvEarlyAdv = await req('POST', '/api/gangs/cv/desmanche', { characterId: char1.id, action: 'advance', sessionId: cvSessId }, token1);
    assert.equal(cvEarlyAdv.status, 400, 'Desmanche CV não pode avançar antes do tempo mínimo');
    dbRef.desmancheSessions![cvSessId].stageReadyAt = Date.now() - 100;
    const cvAdv1 = await req('POST', '/api/gangs/cv/desmanche', { characterId: char1.id, action: 'advance', sessionId: cvSessId }, token1);
    assert.equal(cvAdv1.status, 200);
    const cvEarlyDone = await req('POST', '/api/gangs/cv/desmanche', { characterId: char1.id, action: 'complete', sessionId: cvSessId }, token1);
    assert.equal(cvEarlyDone.status, 400, 'Desmanche CV não pode concluir antes da etapa 2');
    dbRef.desmancheSessions![cvSessId].stageReadyAt = Date.now() - 100;
    const cvAdv2 = await req('POST', '/api/gangs/cv/desmanche', { characterId: char1.id, action: 'advance', sessionId: cvSessId }, token1);
    assert.equal(cvAdv2.status, 200);
    dbRef.desmancheSessions![cvSessId].stageReadyAt = Date.now() - 100;
    const cvDone = await req('POST', '/api/gangs/cv/desmanche', { characterId: char1.id, action: 'complete', sessionId: cvSessId }, token1);
    assert.equal(cvDone.status, 200);
    assert.ok(cvDone.data.payout > 0);

    await req('POST', '/api/factions/action', { characterId: char1.id, factionId: 'ftx_caop2', action: 'join' }, token1);
    await req('POST', '/api/shop/buy', { characterId: char1.id, catalogId: 'sucata_metal', quantity: 1, payWith: 'bank' }, token1);
    const ftxStart = await req('POST', '/api/gangs/ftx/craft', { characterId: char1.id, action: 'start', recipeId: 'craft_municao' }, token1);
    assert.equal(ftxStart.status, 200);
    const craftId = ftxStart.data.craft.id;
    const ftxEarly = await req('POST', '/api/gangs/ftx/craft', { characterId: char1.id, action: 'claim', craftId }, token1);
    assert.equal(ftxEarly.status, 400);
    dbRef.craftSessions![craftId].readyAt = Date.now() - 100;
    const ftxClaim = await req('POST', '/api/gangs/ftx/craft', { characterId: char1.id, action: 'claim', craftId }, token1);
    assert.equal(ftxClaim.status, 200);
    const ammoItem = ftxClaim.data.character.inventory.find((i: any) => i.catalogId === 'municao_pack');
    assert.ok(ammoItem, 'Fabrico FTX deveria entregar Caixa de Munições');
    const stashIn = await req('POST', '/api/gangs/stash', { characterId: char1.id, action: 'store', itemId: ammoItem.id }, token1);
    assert.equal(stashIn.status, 200);
    assert.ok(stashIn.data.faction.stash.some((s: any) => s.catalogId === 'municao_pack'));
    const stashId = stashIn.data.faction.stash.find((s: any) => s.catalogId === 'municao_pack').id;
    const stashOut = await req('POST', '/api/gangs/stash', { characterId: char1.id, action: 'take', itemId: stashId }, token1);
    assert.equal(stashOut.status, 200);

    await req('POST', '/api/factions/action', { characterId: char1.id, factionId: 'bmr_matanga', action: 'join' }, token1);
    const bmrPlant = await req('POST', '/api/gangs/bmr/grow', { characterId: char1.id, action: 'plant' }, token1);
    assert.equal(bmrPlant.status, 200);
    const batchId = bmrPlant.data.batch.id;
    dbRef.growBatches![batchId].readyAt = Date.now() - 100;
    const bmrHarvest = await req('POST', '/api/gangs/bmr/grow', { characterId: char1.id, action: 'harvest', batchId }, token1);
    assert.equal(bmrHarvest.status, 200);
    const bmrSell = await req('POST', '/api/gangs/bmr/grow', { characterId: char1.id, action: 'sell_network' }, token1);
    assert.equal(bmrSell.status, 200);
    assert.ok(bmrSell.data.gain > 0);
    const bmrLaunder = await req('POST', '/api/gangs/bmr/grow', { characterId: char1.id, action: 'launder_capped', amountKz: 5000 }, token1);
    assert.equal(bmrLaunder.status, 200);
    assert.ok(bmrLaunder.data.laundered > 0);
    const terrStart = await req('POST', '/api/gangs/territory', { characterId: char1.id, action: 'start_dispute', district: 'talatona' }, token1);
    assert.equal(terrStart.status, 200);
    const terrEarly = await req('POST', '/api/gangs/territory', { characterId: char1.id, action: 'capture' }, token1);
    assert.equal(terrEarly.status, 400, 'Disputa territorial não pode ser capturada antes do prazo endsAt');
    dbRef.worldState.activeTerritoryDispute!.endsAt = Date.now() - 100;
    const terrCapture = await req('POST', '/api/gangs/territory', { characterId: char1.id, action: 'capture' }, token1);
    assert.equal(terrCapture.status, 200);

    // 22.6 3 ORGANIZAÇÕES LEGAIS (PNA, INEMA, OAA)
    await req('POST', '/api/factions/action', { characterId: char2.id, factionId: 'policia', action: 'join' }, token2);
    const cuffRes = await req('POST', '/api/justice/action', { characterId: char2.id, action: 'handcuff', targetCharId: char1.id }, token2);
    assert.equal(cuffRes.status, 200);
    const escortRes = await req('POST', '/api/justice/action', { characterId: char2.id, action: 'escort', targetCharId: char1.id }, token2);
    assert.equal(escortRes.status, 200);
    const checkIdRes = await req('POST', '/api/justice/action', { characterId: char2.id, action: 'check_id', targetCharId: char1.id }, token2);
    assert.equal(checkIdRes.status, 200);
    assert.equal(checkIdRes.data.inspectedProfile.id, char1.id);
    const seizeRes = await req('POST', '/api/justice/action', { characterId: char2.id, action: 'seize_items', targetCharId: char1.id }, token2);
    assert.equal(seizeRes.status, 200);
    assert.ok(seizeRes.data.seizedCount >= 1);
    await req('POST', '/api/justice/action', { characterId: char2.id, action: 'unhandcuff', targetCharId: char1.id }, token2);

    const call112 = await req('POST', '/api/hospital/action', { characterId: char1.id, action: 'request_112', reason: 'Emergência cardíaca' }, token1);
    assert.equal(call112.status, 200);
    const inemaCallId = call112.data.call.id;
    await req('POST', '/api/factions/action', { characterId: char2.id, factionId: 'hospital', action: 'join' }, token2);
    const acc112 = await req('POST', '/api/hospital/action', { characterId: char2.id, action: 'accept_call', callId: inemaCallId }, token2);
    assert.equal(acc112.status, 200);
    const disch112 = await req(
      'POST',
      '/api/hospital/action',
      { characterId: char2.id, action: 'discharge', callId: inemaCallId, targetCharId: char1.id },
      token2
    );
    assert.equal(disch112.status, 200);

    const hireLawyer = await req(
      'POST',
      '/api/lawyers/action',
      { characterId: char1.id, action: 'hire_lawyer', chargeSummary: 'Recurso administrativo', feeKz: 3000 },
      token1
    );
    assert.equal(hireLawyer.status, 200);
    const lawCaseId = hireLawyer.data.record.id;
    await req('POST', '/api/factions/action', { characterId: char2.id, factionId: 'advogados', action: 'join' }, token2);
    const lawAcc = await req('POST', '/api/lawyers/action', { characterId: char2.id, action: 'hire_accept', caseId: lawCaseId }, token2);
    assert.equal(lawAcc.status, 200);
    const lawHearing = await req(
      'POST',
      '/api/lawyers/action',
      { characterId: char2.id, action: 'court_hearing', caseId: lawCaseId, ruling: 'acquitted' },
      token2
    );
    assert.equal(lawHearing.status, 200);
    assert.equal(lawHearing.data.record.status, 'acquitted');

    // 22.7 WebSocket Veículo Partilhado (Passageiros) & Interior Sync
    const mws1 = new WebSocket(`${wsBaseUrl}?token=${encodeURIComponent(token1)}`);
    const mws2 = new WebSocket(`${wsBaseUrl}?token=${encodeURIComponent(token2)}`);
    const mws2Msgs: any[] = [];
    mws2.on('message', (d) => mws2Msgs.push(JSON.parse(d.toString())));
    await Promise.all([
      new Promise<void>((res) => mws1.once('open', () => res())),
      new Promise<void>((res) => mws2.once('open', () => res())),
    ]);
    mws1.send(JSON.stringify({ type: 'join', token: token1, characterId: char1.id, position: { x: -29, y: 0, z: 58 } }));
    mws2.send(JSON.stringify({ type: 'join', token: token2, characterId: char2.id, position: { x: -27, y: 0, z: 58 } }));
    await new Promise((r) => setTimeout(r, 120));

    mws1.send(
      JSON.stringify({
        type: 'vehicle_enter_seat',
        vehicleId: veh.id,
        seatIndex: 0,
      })
    );
    await new Promise((r) => setTimeout(r, 80));
    mws2.send(
      JSON.stringify({
        type: 'vehicle_enter_seat',
        vehicleId: veh.id,
        seatIndex: 1,
      })
    );
    await new Promise((r) => setTimeout(r, 120));
    assert.ok(
      mws2Msgs.some(
        (m) =>
          m.type === 'shared_vehicle_updated' &&
          m.vehicle?.id === veh.id &&
          m.vehicle?.driverId === char1.id &&
          Array.isArray(m.vehicle?.passengers) &&
          m.vehicle.passengers.some((p: any) => p.characterId === char2.id)
      ),
      'ws2 deveria receber shared_vehicle_updated com condutor e passageiro sincronizados'
    );
    mws1.send(
      JSON.stringify({
        type: 'update',
        position: { x: 638, y: 0, z: 620 },
        rotationY: 0,
        animState: 'idle',
        isDriving: false,
        interiorId: 'house_1',
      })
    );
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(
      mws2Msgs.some((m) => m.type === 'player_updated' && m.id === char1.id && m.interiorId === 'house_1'),
      'ws2 deveria receber player_updated com interiorId sincronizado'
    );
    mws1.send(JSON.stringify({ type: 'vehicle_exit_seat', vehicleId: veh.id }));
    mws2.send(JSON.stringify({ type: 'vehicle_exit_seat', vehicleId: veh.id }));
    mws1.close();
    mws2.close();

    // 22.8 Admin God Telemetria & Controlo ENDE/ELISAL
    const adminOverview2 = await req('GET', '/api/admin/overview', undefined, adminToken);
    assert.equal(adminOverview2.status, 200);
    assert.ok(typeof adminOverview2.data.serverTelemetry?.maxPlayers === 'number');
    assert.ok(typeof adminOverview2.data.serverTelemetry?.memoryRssMb === 'number');

    const admBlkOn = await req('POST', '/api/admin/action', { action: 'trigger_blackout', district: 'talatona' }, adminToken);
    assert.equal(admBlkOn.status, 200);
    assert.ok(admBlkOn.data.worldState.blackoutDistricts.talatona);
    const admBlkOff = await req('POST', '/api/admin/action', { action: 'clear_blackout', district: 'talatona' }, adminToken);
    assert.equal(admBlkOff.status, 200);
    assert.equal(Boolean(admBlkOff.data.worldState.blackoutDistricts.talatona), false);
    const admClean = await req('POST', '/api/admin/action', { action: 'set_cleanliness', district: 'talatona', value: 88 }, adminToken);
    assert.equal(admClean.status, 200);
    assert.equal(admClean.data.worldState.cleanlinessByDistrict.talatona, 88);

    console.log('23. Testando Healthcheck, CORS Allowlist, Sessão Dupla/Anti-Cheat WS, Reanimação Médica INEMA e Imunidade Admin God...');
    const healthRes = await req('GET', '/api/health');
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.data.ok, true);
    assert.equal(healthRes.data.service, 'luanda-rp');
    assert.equal(healthRes.data.status, 'online');
    assert.equal(typeof healthRes.data.activeCitizens, 'number');

    const prevAllowedOrigins = process.env.ALLOWED_ORIGINS;
    process.env.ALLOWED_ORIGINS = 'https://luandarp.ao';
    try {
      const allowedCors = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'https://luandarp.ao' },
      });
      assert.equal(allowedCors.status, 200);
      assert.equal(allowedCors.headers.get('access-control-allow-origin'), 'https://luandarp.ao');

      const blockedCors = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'https://evil-intruder.example' },
      });
      assert.equal(blockedCors.status, 403);
    } finally {
      if (prevAllowedOrigins === undefined) delete process.env.ALLOWED_ORIGINS;
      else process.env.ALLOWED_ORIGINS = prevAllowedOrigins;
    }

    // Reanimação em campo INEMA por médico (char2 em hospital) sobre paciente (char1)
    await req('POST', '/api/factions/action', { characterId: char2.id, factionId: 'hospital', action: 'join' }, token2);
    dbRef.characters[char1.id].stats.health = 0;
    dbRef.characters[char1.id].stats.isUnconscious = true;
    const callField112 = await req('POST', '/api/hospital/action', { characterId: char1.id, action: 'request_112', reason: 'Colapso na via' }, token1);
    assert.equal(callField112.status, 200);
    const fieldCallId = callField112.data.call.id;
    const medicBankBefore = dbRef.characters[char2.id].stats.bankKz;
    const fieldRevive = await req(
      'POST',
      '/api/hospital/action',
      { characterId: char2.id, action: 'inema_field_revive', targetCharId: char1.id, callId: fieldCallId },
      token2
    );
    assert.equal(fieldRevive.status, 200);
    assert.equal(dbRef.characters[char1.id].stats.isUnconscious, false);
    assert.equal(dbRef.characters[char1.id].stats.health, 100);
    assert.equal(dbRef.characters[char2.id].stats.bankKz, medicBankBefore + 3000);
    assert.equal(
      dbRef.worldState.inemaCalls.find((c) => c.id === fieldCallId)?.status,
      'resolved',
      'Chamada 112 deve ficar resolvida após reanimação em campo INEMA'
    );

    // Imunidade do Admin God principal contra banimento e rebaixamento
    const adminAcc = Object.values(dbRef.accounts).find((a) => a.email.toLowerCase() === adminEmail.toLowerCase());
    assert.ok(adminAcc);
    const banSelfAdmin = await req(
      'POST',
      '/api/admin/action',
      { action: 'ban', targetAccountId: adminAcc.id, hours: 10, reason: 'Teste proteção' },
      adminToken
    );
    assert.equal(banSelfAdmin.status, 403);
    const demoteSelfAdmin = await req(
      'POST',
      '/api/admin/action',
      { action: 'set_role', targetAccountId: adminAcc.id, role: 'player' },
      adminToken
    );
    assert.equal(demoteSelfAdmin.status, 403);

    // WebSocket session_conflict & anti-cheat position_correction
    dbRef.characters[char1.id].position = { x: 0, y: 0, z: 10 };
    const cws1 = new WebSocket(`${wsBaseUrl}?token=${encodeURIComponent(token1)}`);
    const cws1Msgs: any[] = [];
    cws1.on('message', (d) => cws1Msgs.push(JSON.parse(d.toString())));
    await new Promise<void>((res) => cws1.once('open', () => res()));
    cws1.send(JSON.stringify({ type: 'join', token: token1, characterId: char1.id, position: { x: 0, y: 0, z: 10 } }));
    await new Promise((r) => setTimeout(r, 100));

    const cwsDup = new WebSocket(`${wsBaseUrl}?token=${encodeURIComponent(token1)}`);
    const cwsDupMsgs: any[] = [];
    cwsDup.on('message', (d) => cwsDupMsgs.push(JSON.parse(d.toString())));
    await new Promise<void>((res) => cwsDup.once('open', () => res()));
    cwsDup.send(JSON.stringify({ type: 'join', token: token1, characterId: char1.id, position: { x: 0, y: 0, z: 10 } }));
    await new Promise((r) => setTimeout(r, 120));
    assert.ok(
      cwsDupMsgs.some((m) => m.type === 'session_conflict'),
      'Segunda ligação simultânea para a mesma personagem deve receber session_conflict'
    );
    try { cwsDup.close(); } catch {}

    // Anti-cheat salto impossível (> 130 m/s num único update)
    cws1.send(
      JSON.stringify({
        type: 'update',
        position: { x: 380, y: 0, z: 380 },
        rotationY: 0,
        animState: 'run',
        isDriving: false,
      })
    );
    await new Promise((r) => setTimeout(r, 120));
    assert.ok(
      cws1Msgs.some((m) => m.type === 'position_correction'),
      'Salto de teleporte inválido deve acionar position_correction no servidor'
    );
    cws1.close();

    console.log('24. Testando Fazenda Verde, Porte de Arma, Test Drive, Aeroporto TAAG e Empresas...');
    dbRef.characters[char1.id].stats.bankKz += 150000;
    dbRef.characters[char1.id].stats.cashKz += 50000;

    // Fazenda Verde
    const farmStateRes = await req('GET', '/api/farm/state', undefined, token1);
    assert.equal(farmStateRes.status, 200);
    assert.ok(Array.isArray(farmStateRes.data.plants) && farmStateRes.data.plants.length >= 6);

    const farmStartRes = await req('POST', '/api/farm/action', { characterId: char1.id, action: 'start_job' }, token1);
    assert.equal(farmStartRes.status, 200);
    assert.equal(farmStartRes.data.character.customization.outfitStyle, 'agricultor_uniform');

    const farmRentVan = await req('POST', '/api/farm/action', { characterId: char1.id, action: 'rent_van' }, token1);
    assert.equal(farmRentVan.status, 200);
    assert.equal(farmRentVan.data.van.modelId, 'pickup_fazenda');

    const farmHarvest = await req(
      'POST',
      '/api/farm/action',
      { characterId: char1.id, action: 'harvest_plant', plantId: 'farm-plant-1' },
      token1
    );
    assert.equal(farmHarvest.status, 200);
    assert.equal(farmHarvest.data.character.stats.farmCrates, 1);

    const farmDeliver = await req(
      'POST',
      '/api/farm/action',
      { characterId: char1.id, action: 'deliver_crates', drivingModelId: 'pickup_fazenda', enforceVehicle: true },
      token1
    );
    assert.equal(farmDeliver.status, 200);
    assert.ok(farmDeliver.data.payout >= 1500 && farmDeliver.data.payout <= 2300);

    // Licença de Porte de Arma (50.000 Kz) & Multas
    dbRef.characters[char1.id].stats.unpaidFinesKz = 3500;
    const payFinesRes = await req('POST', '/api/justice/action', { characterId: char1.id, action: 'pay_fines' }, token1);
    assert.equal(payFinesRes.status, 200);
    assert.equal(payFinesRes.data.character.stats.unpaidFinesKz, 0);

    dbRef.characters[char2.id].stats.bankKz += 60000;
    const buyLicRes = await req('POST', '/api/justice/action', { characterId: char2.id, action: 'buy_weapon_license' }, token2);
    assert.equal(buyLicRes.status, 200);
    assert.ok(buyLicRes.data.character.stats.weaponLicenseUntil > Date.now());

    const prevLic = dbRef.characters[char1.id].stats.weaponLicenseUntil || Date.now();
    const renewLicRes = await req('POST', '/api/justice/action', { characterId: char1.id, action: 'renew_weapon_license' }, token1);
    assert.equal(renewLicRes.status, 200);
    assert.ok(renewLicRes.data.character.stats.weaponLicenseUntil > prevLic);

    // Test Drive CICOMEX (90s)
    const tdRes = await req('POST', '/api/vehicles/test-drive', { characterId: char1.id, modelId: 'suv_prado' }, token1);
    assert.equal(tdRes.status, 200);
    assert.equal(tdRes.data.vehicle.isTestDrive, true);

    // Aeroporto Check-in TAAG
    const airportRes = await req(
      'POST',
      '/api/airport/checkin',
      { characterId: char1.id, flightId: 'flight-ilha', payWith: 'bank' },
      token1
    );
    assert.equal(airportRes.status, 200);
    assert.equal(airportRes.data.flight.id, 'flight-ilha');

    // Restaurante Ilha (Empresa)
    const hireSelf = await req(
      'POST',
      '/api/properties/biz-restaurante-ilha/action',
      { characterId: char1.id, action: 'hire_self' },
      token1
    );
    assert.equal(hireSelf.status, 200);
    const restCook = await req(
      'POST',
      '/api/properties/biz-restaurante-ilha/action',
      { characterId: char1.id, action: 'rest_cook' },
      token1
    );
    assert.equal(restCook.status, 200);
    const restCollect = await req(
      'POST',
      '/api/properties/biz-restaurante-ilha/action',
      { characterId: char1.id, action: 'rest_collect_plate' },
      token1
    );
    assert.equal(restCollect.status, 200);

    console.log('25. Testando Estabilidade Multi-Jogador (RateLimit NAT, Spawn Casa, Reconnect, Veículo Exit/Disconnect e Meta Live)...');
    // A) Spawn em casa própria no join não deve disparar position_correction
    const ownedProp = dbRef.properties.find((p) => p.type !== 'business' && !p.ownerId);
    assert.ok(ownedProp);
    ownedProp.ownerId = char2.id;
    dbRef.characters[char2.id].stats.homePropertyId = ownedProp.id;
    dbRef.characters[char2.id].position = { x: -29, y: 0, z: 58 };

    const homeSpawnPos = { x: ownedProp.position[0], y: 0, z: ownedProp.position[2] + 6 };
    const wsHome = new WebSocket(`${wsBaseUrl}?token=${encodeURIComponent(token2)}`);
    const wsHomeMsgs: any[] = [];
    wsHome.on('message', (d) => wsHomeMsgs.push(JSON.parse(d.toString())));
    await new Promise<void>((res) => wsHome.once('open', () => res()));
    wsHome.send(
      JSON.stringify({
        type: 'join',
        token: token2,
        characterId: char2.id,
        clientInstanceId: 'inst-home-test',
        position: homeSpawnPos,
      })
    );
    await new Promise((r) => setTimeout(r, 120));
    wsHome.send(
      JSON.stringify({
        type: 'update',
        position: { x: homeSpawnPos.x + 1, y: 0, z: homeSpawnPos.z },
        rotationY: 0,
        animState: 'walk',
        isDriving: false,
      })
    );
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(
      wsHomeMsgs.some((m) => m.type === 'position_correction'),
      false,
      'Spawn legítimo na casa própria não deve acionar anti-cheat position_correction'
    );

    // B) Reconnect com mesmo clientInstanceId substitui socket antigo sem session_conflict
    const wsHomeReconn = new WebSocket(`${wsBaseUrl}?token=${encodeURIComponent(token2)}`);
    const wsHomeReconnMsgs: any[] = [];
    wsHomeReconn.on('message', (d) => wsHomeReconnMsgs.push(JSON.parse(d.toString())));
    await new Promise<void>((res) => wsHomeReconn.once('open', () => res()));
    wsHomeReconn.send(
      JSON.stringify({
        type: 'join',
        token: token2,
        characterId: char2.id,
        clientInstanceId: 'inst-home-test',
        position: homeSpawnPos,
      })
    );
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(
      wsHomeReconnMsgs.some((m) => m.type === 'session_conflict'),
      false,
      'Reconexão da mesma instância do cliente não deve receber session_conflict'
    );
    assert.ok(wsHomeReconnMsgs.some((m) => m.type === 'init'));

    // C) Outro jogador conectado recebe player_meta_updated em tempo real ao atualizar aparência/facção
    const wsPeer = new WebSocket(`${wsBaseUrl}?token=${encodeURIComponent(token1)}`);
    const wsPeerMsgs: any[] = [];
    wsPeer.on('message', (d) => wsPeerMsgs.push(JSON.parse(d.toString())));
    await new Promise<void>((res) => wsPeer.once('open', () => res()));
    wsPeer.send(
      JSON.stringify({
        type: 'join',
        token: token1,
        characterId: char1.id,
        clientInstanceId: 'inst-peer-1',
        position: dbRef.characters[char1.id].position,
      })
    );
    await new Promise((r) => setTimeout(r, 100));

    const renameRes = await req(
      'PATCH',
      `/api/characters/${char2.id}/appearance`,
      { name: 'Mateus', surname: 'Kiala' },
      token2
    );
    assert.equal(renameRes.status, 200);
    await new Promise((r) => setTimeout(r, 100));
    const metaUpdateMsg = wsPeerMsgs.find((m) => m.type === 'player_meta_updated' && m.id === char2.id);
    assert.ok(metaUpdateMsg && metaUpdateMsg.name === 'Mateus Kiala', 'Peers online devem receber atualização de nome ao vivo');

    // D) Veículo: vehicle_sync tardio após vehicle_exit_seat não deve re-apropriar driverId
    const testVehId = 'veh-sync-guard-1';
    wsHomeReconn.send(
      JSON.stringify({
        type: 'vehicle_enter_seat',
        vehicleId: testVehId,
        seatIndex: 0,
        vehicleMeta: { modelId: 'taxi_i10', name: 'Hyundai i10', type: 'taxi', plate: 'LD-88-88-AO', color: '#2563eb' },
      })
    );
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(dbRef.sharedVehicles[testVehId]?.driverId, char2.id);

    wsHomeReconn.send(JSON.stringify({ type: 'vehicle_exit_seat', vehicleId: testVehId }));
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(dbRef.sharedVehicles[testVehId]?.driverId, null);

    wsHomeReconn.send(
      JSON.stringify({
        type: 'vehicle_sync',
        vehicle: { id: testVehId, position: { x: 12, y: 0, z: 12 }, rotationY: 0, speedKmh: 20 },
      })
    );
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(
      dbRef.sharedVehicles[testVehId]?.driverId,
      null,
      'Pacote vehicle_sync tardio após saída da viatura não pode reatribuir driverId'
    );

    try { wsHome.close(); } catch {}
    try { wsHomeReconn.close(); } catch {}
    try { wsPeer.close(); } catch {}

    console.log('✅ TODOS OS 25 TESTES DE INTEGRAÇÃO ULTIMATO PASSARAM COM SUCESSO!');
  } finally {
    wss.close();
    server.close();
    try {
      if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
    } catch {}
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ TESTE FALHOU:', err);
    process.exit(1);
  });
