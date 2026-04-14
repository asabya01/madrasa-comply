-- Add is_active to profiles
-- When false the user cannot log in or access the platform

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN profiles.is_active IS
  'When false the user cannot log in or access the platform';

-- Allow super admins to update any profile (e.g. toggle is_active)
CREATE POLICY "super_admin_update_profiles"
  ON profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.is_super_admin = true
    )
  );
