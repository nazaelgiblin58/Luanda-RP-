# Especificação de Segurança Firestore — LUANDA RP

## 1. Invariantes de Dados & Mapeamento Relacional (Master Gate)

1. **Identidade & Separação de PII (`/users/{userId}` e `/users/{userId}/private/info`)**:
   - Nenhum documento em `/users/{userId}` pode conter email, telefone ou dados pessoais sensíveis.
   - Um utilizador só pode criar `/users/{userId}` com `uid == request.auth.uid`, `role == 'player'`, `email_verified == true` e timestamps iguais a `request.time`.
   - O subdocumento `/users/{userId}/private/{docId}` exige que o documento pai `/users/{userId}` exista (`exists(...)`) e apenas o próprio proprietário (`isOwner(userId)`) ou `isAdmin()` podem ler/escrever.
2. **Personagens na Nuvem (`/characters/{characterId}`)**:
   - Um snapshot de personagem exige que `/users/$(request.auth.uid)` exista, que `ownerId == request.auth.uid` na criação, e que `ownerId` + `characterId` + `createdAt` sejam imutáveis nas atualizações.
   - `list` está restrito a documentos onde `resource.data.ownerId == request.auth.uid` (custo O(1), sem `get()` ou `exists()` em `allow list`).
3. **Classificação Pública (`/leaderboard/{characterId}`)**:
   - `create` exige existência prévia de `/characters/$(characterId)` pertencente a `request.auth.uid` (Integridade Referencial).
   - `get` e `list` só permitem registos marcados explicitamente com `isPublic == true` ou pertencentes ao próprio utilizador.
4. **Controlo de Acesso Administrativo (`/admins/{userId}`)**:
   - Apenas o administrador raiz autenticado e com `email_verified == true` (`nazaelgiblin58@gmail.com`) pode conceder, atualizar ou revogar documentos `/admins/{userId}`.

---

## 2. "Dirty Dozen" — 12 Payloads Adversariais (Todos Devem Receber `PERMISSION_DENIED`)

1. **Shadow Update em `/users/{uid}` (Ghost Field `isAdmin: true`)**:
   ```json
   { "uid": "user_1", "displayName": "Kamba", "role": "player", "linkedAccountId": "acc-1", "isAdmin": true, "createdAt": "<serverTime>", "updatedAt": "<serverTime>" }
   ```
2. **Auto-Escalação de Privilégio na Criação de `/users/{uid}` (`role: "admin_god"`)**:
   ```json
   { "uid": "user_1", "displayName": "Hacker", "role": "admin_god", "linkedAccountId": "acc-1", "createdAt": "<serverTime>", "updatedAt": "<serverTime>" }
   ```
3. **Spoofing de Email Não Verificado (`email: "nazaelgiblin58@gmail.com"`, `email_verified: false`)**:
   Tentativa de criar/escrever em `/admins/attacker_uid` ou ler `/users/other_uid/private/info`.
4. **Leitura de PII alheia (`/users/victim_uid/private/info` por `attacker_uid`)**:
   Pedido `get` autenticado mas não proprietário e não admin.
5. **Orphaned Write em `/users/{uid}/private/info` sem `/users/{uid}` pai**:
   ```json
   { "uid": "user_1", "email": "user@luanda.ao", "createdAt": "<serverTime>", "updatedAt": "<serverTime>" }
   ```
6. **Falsificação de `ownerId` ao criar `/characters/char-999` (`ownerId: "victim_uid"`)**:
   ```json
   { "characterId": "char-999", "ownerId": "victim_uid", "name": "Fake", "surname": "User", "idNumber": "001LA001", "level": 1, "cashKz": 100, "bankKz": 7000, "factionId": "civil", "factionRank": "Cidadao", "jobId": "desempregado", "district": "Centro & Baixa", "createdAt": "<serverTime>", "updatedAt": "<serverTime>" }
   ```
7. **Mutação de Campo Imutável (`ownerId` alterado em `update` de `/characters/{id}`)**:
   Update tentando mudar `ownerId` de `user_1` para `user_2`.
8. **Envenenamento de ID (`characterId` com 200 caracteres ou espaços/símbolos)**:
   `doc(db, 'characters', 'bad id!@#...200chars...')` com `{ "characterId": "bad id!@#" ... }`.
9. **Envenenamento de Valor (`cashKz` negativo ou string, ou `name` > 40 chars)**:
   ```json
   { "name": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "cashKz": -5000 }
   ```
10. **Falsificação de Timestamp (`createdAt` / `updatedAt` manual no passado/futuro diferente de `request.time`)**:
    `{ "createdAt": "2020-01-01T00:00:00Z", "updatedAt": "2099-01-01T00:00:00Z" }`.
11. **Consulta Blanket `list` em `/characters` por utilizador tentando listar todos sem filtro `where('ownerId', '==', uid)`**:
    Rejeitado por `allow list: if isSignedIn() && existing().ownerId == request.auth.uid;`.
12. **Entrada órfã em `/leaderboard/char-inexistente` sem documento pai em `/characters`**:
    Rejeitado por `exists(/databases/$(database)/documents/characters/$(characterId))`.
