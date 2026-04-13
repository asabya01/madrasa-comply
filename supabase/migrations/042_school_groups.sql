-- School groups — enables multi-school chain dashboard
CREATE TABLE IF NOT EXISTS school_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS school_group_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES school_groups(id) ON DELETE CASCADE,
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  added_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (group_id, school_id)
);

-- chain_admin_profiles: which users can see which groups
CREATE TABLE IF NOT EXISTS chain_admin_profiles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id     UUID NOT NULL REFERENCES school_groups(id) ON DELETE CASCADE,
  UNIQUE (user_id, group_id)
);

ALTER TABLE school_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chain_admin_profiles ENABLE ROW LEVEL SECURITY;

-- super_admin sees everything; chain_admin sees their own groups
CREATE POLICY "super_admin full access on school_groups"
  ON school_groups FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "chain_admin sees own groups"
  ON school_groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chain_admin_profiles
      WHERE user_id = auth.uid() AND group_id = school_groups.id
    )
  );

CREATE POLICY "super_admin full access on school_group_members"
  ON school_group_members FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "chain_admin sees own group members"
  ON school_group_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chain_admin_profiles
      WHERE user_id = auth.uid() AND group_id = school_group_members.group_id
    )
  );

CREATE POLICY "super_admin full access on chain_admin_profiles"
  ON chain_admin_profiles FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "chain_admin sees own record"
  ON chain_admin_profiles FOR SELECT
  USING (user_id = auth.uid());
