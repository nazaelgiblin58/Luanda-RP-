-- ============================================================================
-- LUANDA RP — Esquema Completo PostgreSQL + Supabase Auth + RLS + Realtime
-- Executa este script no SQL Editor do projeto Supabase.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. TABELA DE PERFIS (associada permanentemente a auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  display_name text,
  role text NOT NULL DEFAULT 'player'
    CHECK (role IN ('player', 'moderador', 'administrador', 'gestor', 'admin_god')),
  account_status text NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('pending', 'active', 'suspended', 'banned')),
  banned_until timestamptz,
  ban_reason text NOT NULL DEFAULT '',
  suspended_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. ORGANIZAÇÕES & FACÇÕES
CREATE TABLE IF NOT EXISTS public.organizations (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  leader_id text,
  leader_name text NOT NULL DEFAULT 'Aguardando Admin God',
  suspended boolean NOT NULL DEFAULT false,
  treasury_kz bigint NOT NULL DEFAULT 0,
  base_district text,
  base_pos jsonb NOT NULL DEFAULT '[0,0,0]'::jsonb,
  interior_id text,
  announcement text NOT NULL DEFAULT '',
  ranks_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  stash_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.factions (
  id text PRIMARY KEY,
  organization_id text REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  faction_type text NOT NULL CHECK (faction_type IN ('legal', 'gangue')),
  leader_char_id text,
  leader_name text NOT NULL DEFAULT 'Aguardando Admin God',
  suspended boolean NOT NULL DEFAULT false,
  treasury_kz bigint NOT NULL DEFAULT 0,
  base_district text,
  station_role text,
  station_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. PERSONAGENS
CREATE TABLE IF NOT EXISTS public.characters (
  id text PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  legacy_account_id text,
  name text NOT NULL,
  surname text NOT NULL,
  age integer NOT NULL DEFAULT 24,
  nationality text NOT NULL DEFAULT 'Angolana',
  gender text NOT NULL DEFAULT 'masculino',
  bi text NOT NULL,
  phone text NOT NULL,
  history text NOT NULL DEFAULT '',
  cash_kz bigint NOT NULL DEFAULT 100 CHECK (cash_kz >= 0),
  bank_kz bigint NOT NULL DEFAULT 7000,
  loan_balance_kz bigint NOT NULL DEFAULT 0,
  xp integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1 CHECK (level >= 1),
  job_id text,
  job_level integer NOT NULL DEFAULT 1,
  job_xp integer NOT NULL DEFAULT 0,
  faction_id text REFERENCES public.organizations(id) ON DELETE SET NULL,
  faction_rank text NOT NULL DEFAULT 'Civil',
  skin_preset_id text,
  customization_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  home_property_id text,
  position_json jsonb NOT NULL DEFAULT '{"x": -29, "y": 0, "z": 58}'::jsonb,
  rotation_y double precision NOT NULL DEFAULT 3.14159,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_characters_user_id ON public.characters(user_id);
CREATE INDEX IF NOT EXISTS idx_characters_faction_id ON public.characters(faction_id);

-- 4. ESTATÍSTICAS E PROGRESSO DO JOGADOR
CREATE TABLE IF NOT EXISTS public.player_stats (
  character_id text PRIMARY KEY REFERENCES public.characters(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  health integer NOT NULL DEFAULT 100,
  armor integer NOT NULL DEFAULT 0,
  energy integer NOT NULL DEFAULT 100,
  hunger integer NOT NULL DEFAULT 100,
  thirst integer NOT NULL DEFAULT 100,
  sleep integer NOT NULL DEFAULT 100,
  bleeding boolean NOT NULL DEFAULT false,
  is_unconscious boolean NOT NULL DEFAULT false,
  handcuffed boolean NOT NULL DEFAULT false,
  wanted_stars integer NOT NULL DEFAULT 0,
  jail_until bigint NOT NULL DEFAULT 0,
  jail_reason text NOT NULL DEFAULT '',
  assigned_cell integer NOT NULL DEFAULT 0,
  is_frozen boolean NOT NULL DEFAULT false,
  weapon_license_until bigint NOT NULL DEFAULT 0,
  unpaid_fines_kz bigint NOT NULL DEFAULT 0,
  jobs_completed integer NOT NULL DEFAULT 0,
  purchases_count integer NOT NULL DEFAULT 0,
  robberies_count integer NOT NULL DEFAULT 0,
  heals_count integer NOT NULL DEFAULT 0,
  missions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  achievements_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_stats_user_id ON public.player_stats(user_id);

-- 5. INVENTÁRIO E ARMAS
CREATE TABLE IF NOT EXISTS public.player_inventory (
  id text PRIMARY KEY,
  character_id text NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  catalog_id text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  weight double precision NOT NULL DEFAULT 0.1,
  equipped boolean NOT NULL DEFAULT false,
  usable boolean NOT NULL DEFAULT false,
  sell_price_kz integer NOT NULL DEFAULT 0,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_inventory_char_id ON public.player_inventory(character_id);
CREATE INDEX IF NOT EXISTS idx_player_inventory_user_id ON public.player_inventory(user_id);

-- 6. VEÍCULOS DOS JOGADORES
CREATE TABLE IF NOT EXISTS public.player_vehicles (
  id text PRIMARY KEY,
  owner_char_id text NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  model_id text NOT NULL,
  name text NOT NULL,
  vehicle_type text NOT NULL,
  plate text NOT NULL,
  color text NOT NULL,
  accent_color text,
  skin_id text,
  engine_level integer NOT NULL DEFAULT 1,
  suspension_level integer NOT NULL DEFAULT 1,
  wheel_style text NOT NULL DEFAULT 'padrao',
  fuel integer NOT NULL DEFAULT 100,
  health integer NOT NULL DEFAULT 100,
  mileage_km double precision NOT NULL DEFAULT 0,
  is_locked boolean NOT NULL DEFAULT false,
  is_stored_in_garage boolean NOT NULL DEFAULT false,
  is_impounded boolean NOT NULL DEFAULT false,
  fines_kz integer NOT NULL DEFAULT 0,
  is_rental boolean NOT NULL DEFAULT false,
  rented_until bigint,
  position_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  rotation_y double precision NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_vehicles_owner ON public.player_vehicles(owner_char_id);
CREATE INDEX IF NOT EXISTS idx_player_vehicles_user_id ON public.player_vehicles(user_id);

-- 7. MEMBROS & HIERARQUIA DE ORGANIZAÇÕES
CREATE TABLE IF NOT EXISTS public.organization_members (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  character_id text NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  character_name text NOT NULL,
  rank_name text NOT NULL,
  rank_level integer NOT NULL DEFAULT 1,
  hierarchy_role text NOT NULL DEFAULT 'Membro'
    CHECK (hierarchy_role IN ('Líder', 'Sublíder', 'Coronel', 'Sargento', 'Membro', 'Jogador normal')),
  bi text,
  phone text,
  permissions_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, character_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.organization_members(user_id);

-- 8. CASAS & PROPRIEDADES
CREATE TABLE IF NOT EXISTS public.player_properties (
  id text PRIMARY KEY,
  name text NOT NULL,
  property_type text NOT NULL,
  category text NOT NULL,
  district text NOT NULL,
  owner_char_id text REFERENCES public.characters(id) ON DELETE SET NULL,
  owner_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  owner_name text,
  renter_char_id text REFERENCES public.characters(id) ON DELETE SET NULL,
  renter_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  renter_name text,
  price_kz bigint NOT NULL,
  rent_kz bigint NOT NULL DEFAULT 0,
  safe_kz bigint NOT NULL DEFAULT 0,
  unpaid_bills_kz bigint NOT NULL DEFAULT 0,
  bills_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  shared_keys_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  stash_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  employees_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  position_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_properties_owner_user ON public.player_properties(owner_user_id);

-- 9. TRANSAÇÕES FINANCEIRAS
CREATE TABLE IF NOT EXISTS public.player_money_transactions (
  id text PRIMARY KEY,
  character_id text NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  tx_type text NOT NULL,
  amount_kz bigint NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_tx_char_id ON public.player_money_transactions(character_id);
CREATE INDEX IF NOT EXISTS idx_player_tx_user_id ON public.player_money_transactions(user_id);

-- 10. REGISTOS DE AUDITORIA ADMINISTRATIVA
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id text PRIMARY KEY,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_email text NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  target_id text,
  details text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON public.admin_logs(created_at DESC);

-- ============================================================================
-- FUNÇÕES DE SEGURANÇA & GATILHO AUTOMÁTICO DE PERFIL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid()),
    'player'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_god()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role() = 'admin_god';
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role() IN ('moderador', 'administrador', 'gestor', 'admin_god');
$$;

CREATE OR REPLACE FUNCTION public.is_account_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT account_status = 'active'
      AND (banned_until IS NULL OR banned_until <= now())
      AND (suspended_until IS NULL OR suspended_until <= now())
    FROM public.profiles
    WHERE id = auth.uid()
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_org_member(p_org_id text, p_target_rank_level integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = auth.uid()
      AND om.hierarchy_role IN ('Líder', 'Sublíder', 'Coronel')
      AND om.rank_level > p_target_rank_level
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := LOWER(COALESCE(NEW.email, ''));
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role, account_status)
  VALUES (
    NEW.id,
    v_email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(COALESCE(NEW.email, 'cidadao'), '@', 1)),
    CASE WHEN v_email = 'nazaelgiblin58@gmail.com' THEN 'admin_god' ELSE 'player' END,
    'active'
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        role = CASE WHEN EXCLUDED.email = 'nazaelgiblin58@gmail.com' THEN 'admin_god' ELSE public.profiles.role END,
        updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) RIGOROSO EM TODAS AS 11 TABELAS
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_money_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

-- PROFILES: jogador lê apenas o seu perfil; staff lê todos;
-- jogador só pode atualizar display_name (NUNCA role, account_status, banned_until ou suspended_until).
DROP POLICY IF EXISTS profiles_select_own_or_staff ON public.profiles;
CREATE POLICY profiles_select_own_or_staff ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff());

DROP POLICY IF EXISTS profiles_update_own_safe ON public.profiles;
CREATE POLICY profiles_update_own_safe ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() AND public.is_account_active())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND account_status = (SELECT p.account_status FROM public.profiles p WHERE p.id = auth.uid())
    AND banned_until IS NOT DISTINCT FROM (SELECT p.banned_until FROM public.profiles p WHERE p.id = auth.uid())
    AND suspended_until IS NOT DISTINCT FROM (SELECT p.suspended_until FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS profiles_admin_god_manage ON public.profiles;
CREATE POLICY profiles_admin_god_manage ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin_god())
  WITH CHECK (public.is_admin_god());

-- CHARACTERS: apenas o dono ou staff pode consultar; dinheiro, nível, XP e facção são controlados pelo servidor.
DROP POLICY IF EXISTS characters_select_own_or_staff ON public.characters;
CREATE POLICY characters_select_own_or_staff ON public.characters
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff());

-- PLAYER_STATS: apenas dono ou staff lê; alterações apenas no servidor/service_role.
DROP POLICY IF EXISTS player_stats_select_own_or_staff ON public.player_stats;
CREATE POLICY player_stats_select_own_or_staff ON public.player_stats
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff());

-- PLAYER_INVENTORY: apenas dono ou staff lê; alterações apenas no servidor/service_role.
DROP POLICY IF EXISTS player_inventory_select_own_or_staff ON public.player_inventory;
CREATE POLICY player_inventory_select_own_or_staff ON public.player_inventory
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff());

-- PLAYER_VEHICLES: apenas dono ou staff lê; alterações apenas no servidor/service_role.
DROP POLICY IF EXISTS player_vehicles_select_own_or_staff ON public.player_vehicles;
CREATE POLICY player_vehicles_select_own_or_staff ON public.player_vehicles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff());

-- ORGANIZATIONS & FACTIONS: leitura para autenticados; alteração apenas Admin God ou servidor.
DROP POLICY IF EXISTS organizations_select_auth ON public.organizations;
CREATE POLICY organizations_select_auth ON public.organizations
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS organizations_admin_god_update ON public.organizations;
CREATE POLICY organizations_admin_god_update ON public.organizations
  FOR ALL TO authenticated
  USING (public.is_admin_god())
  WITH CHECK (public.is_admin_god());

DROP POLICY IF EXISTS factions_select_auth ON public.factions;
CREATE POLICY factions_select_auth ON public.factions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS factions_admin_god_manage ON public.factions;
CREATE POLICY factions_admin_god_manage ON public.factions
  FOR ALL TO authenticated
  USING (public.is_admin_god())
  WITH CHECK (public.is_admin_god());

-- ORGANIZATION_MEMBERS: leitura pública autenticada; nomeação de Líder exclusiva Admin God;
-- Líder/Sublíder/Coronel podem gerir apenas patentes estritamente inferiores e nunca auto-promover.
DROP POLICY IF EXISTS org_members_select_auth ON public.organization_members;
CREATE POLICY org_members_select_auth ON public.organization_members
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS org_members_manage_hierarchy ON public.organization_members;
CREATE POLICY org_members_manage_hierarchy ON public.organization_members
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_god()
    OR (
      user_id <> auth.uid()
      AND hierarchy_role <> 'Líder'
      AND public.can_manage_org_member(organization_id, rank_level)
    )
  )
  WITH CHECK (
    public.is_admin_god()
    OR (
      user_id <> auth.uid()
      AND hierarchy_role <> 'Líder'
      AND public.can_manage_org_member(organization_id, rank_level)
    )
  );

DROP POLICY IF EXISTS org_members_admin_god_insert_delete ON public.organization_members;
CREATE POLICY org_members_admin_god_insert_delete ON public.organization_members
  FOR ALL TO authenticated
  USING (public.is_admin_god())
  WITH CHECK (public.is_admin_god());

-- PLAYER_PROPERTIES: imóveis públicos podem ser consultados no catálogo por autenticados; cofre privado/gestão via servidor.
DROP POLICY IF EXISTS player_properties_select_auth ON public.player_properties;
CREATE POLICY player_properties_select_auth ON public.player_properties
  FOR SELECT TO authenticated
  USING (true);

-- PLAYER_MONEY_TRANSACTIONS: estritamente privado do dono ou staff.
DROP POLICY IF EXISTS player_tx_select_own_or_staff ON public.player_money_transactions;
CREATE POLICY player_tx_select_own_or_staff ON public.player_money_transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff());

-- ADMIN_LOGS: leitura exclusiva de staff; escrita exclusiva via servidor/service_role.
DROP POLICY IF EXISTS admin_logs_select_staff ON public.admin_logs;
CREATE POLICY admin_logs_select_staff ON public.admin_logs
  FOR SELECT TO authenticated
  USING (public.is_staff());

-- ============================================================================
-- SUPABASE REALTIME
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.characters; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.organizations; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_members; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.factions; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.player_properties; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_logs; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
