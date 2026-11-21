# LUANDA RP 🇦🇴 — Mundo Aberto 3D Multiplayer Roleplay

Jogo de Roleplay 3D em mundo aberto inspirado na experiência clássica de **GTA Roleplay (SA-MP / FiveM)**, ambientado em **Luanda, Angola**, com economia real em **Kwanzas (Kz)**, arquitetura servidor-autoritativa, multijogador em tempo real via WebSockets e personalização completa de personagens e viaturas.

---

## Principais Funcionalidades

- **Contas Persistentes e Segurança**:
  - Registo, Login e Recuperação de palavra-passe com código único.
  - Até 4 personagens por conta com Bilhete de Identidade (BI), nº de telemóvel angolano, idade, nacionalidade, género, histórico e visual 3D.
  - Validação estrita de dinheiro, inventário, salários e cargos de staff no servidor.
- **Mundo Aberto de Luanda (8 Distritos)**:
  - **Centro & Baixa** (Marginal 4 de Fevereiro, Banco BFA, Tribunal, Concessionária, Obelisco)
  - **Ilha de Luanda** (Praias, Calçadão, Quiosques de Mufete, Natação oceânica)
  - **Maianga** (Hospital Josina Machel INEMA, Comando da Polícia Nacional, Farmácia)
  - **Viana** (Mercado dos Congolenses, Zona Industrial, Beco Ilegal)
  - **Talatona** (Torre Empresarial, Oficina Auto Luanda, Posto Sonangol, Condomínios)
  - **Kilamba** (Blocos Residenciais, Supermercado Central)
  - **Cacuaco** (Porto de Luanda, Terminal de Contentores, Quintas Agrícolas)
  - **Aeroporto Internacional 4 de Fevereiro** (Pista e Terminal ligados por ponte)
- **Economia, Empregos & Facções**:
  - **16 Empregos Jogáveis** com uniforme automático, baliza GPS 3D e progresso por etapas (Taxista, Autocarro, PNA, Médico INEMA, Bombeiro, Mecânico, Pescador, Transportador, Caminhoneiro, Kupapata, Agricultor, Construção, Motorista VIP, Restaurante, Limpeza Urbana, Empresário).
  - **8 Facções** com hierarquia de postos, cofre e gestão de membros.
  - **Multicaixa BFA**: Depósitos, levantamentos, transferências por Telefone/BI/Nome, pagamento em mão, empréstimos e extrato de transações.
  - **Imobiliária & Empresas**: Compra, arrendamento, cofre blindado, faturas ENDE/EPAL e recolha de lucros empresariais.
- **Veículos, Polícia & Saúde**:
  - 9 modelos compráveis (Motorizada Kupapata, Táxi Amarelo, Candongueiro HiAce, Pickup 4x4, Toyota Prado, Autocarro, Camião, Interceptor PNA, Ambulância INEMA).
  - Garagem pessoal, oficina (pintura, jantes, motor Nv.1–3, combustível, reparação), trancamento e controlo de motor/faróis.
  - Terminal CAD da Polícia (multas, mandados, prisão com fiança, apreensão), Hospital INEMA e atividades criminosas RP com alertas 112/113 em tempo real.
- **Smartphone Luanda 5G & Rádio Angolana**:
  - Mensagens SMS entre jogadores, anúncios classificados, chamadas 112/113, GPS 3D e Rádio FM Kizomba/Semba sintetizada.

---

## Variáveis de Ambiente

Consulta `.env.example`:

- `PORT`: Porta do servidor Express + WebSocket (padrão `3000`).
- `AUTH_SECRET`: Segredo HMAC para tokens de sessão.
- `ADMIN_EMAIL`: Email da conta com privilégios `admin_god`.
- `LUANDA_DB_PATH`: Caminho opcional para o ficheiro JSON da base de dados (padrão `data/luandarp_db.json`).

---

## Comandos

```bash
npm install
npm run dev      # Inicia servidor backend Express + WS + Vite na porta 3000
npm run lint     # Verificação de tipos TypeScript (tsc --noEmit)
npm run build    # Compila o frontend para produção
npm start        # Inicia servidor em modo produção
```

---

## Controlos no Jogo

| Tecla | Ação |
| --- | --- |
| `W / A / S / D` ou Setas | Mover a pé / Conduzir viatura |
| `Shift` | Correr |
| `Espaço` | Saltar / Travão de mão |
| `C` ou `Ctrl` | Agachar |
| `F` | Golpe / Soco RP |
| `E` | Entrar ou Sair de viatura / Interagir com edifícios e NPCs |
| `K` / `L` / `U` | Ligar-Desligar Motor / Faróis / Trancar viatura |
| `H` | Buzinar |
| `I` / `P` / `J` / `G` | Abrir Mochila / Telemóvel / Empregos / Garagem |
| `B` / `M` | Abrir Multicaixa / Mapa-Radar GPS |
| Rato (arrastar) / Scroll | Câmera 360° / Zoom |
