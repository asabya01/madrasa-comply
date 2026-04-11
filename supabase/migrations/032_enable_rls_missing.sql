-- Enable RLS on tables that were missing it
ALTER TABLE domain_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE standard_ratings ENABLE ROW LEVEL SECURITY;

-- domain_ratings policies
CREATE POLICY "school members can manage domain_ratings"
  ON domain_ratings FOR ALL
  USING (school_id = ANY(get_my_school_ids()))
  WITH CHECK (school_id = ANY(get_my_school_ids()));

-- standard_ratings policies
CREATE POLICY "school members can manage standard_ratings"
  ON standard_ratings FOR ALL
  USING (school_id = ANY(get_my_school_ids()))
  WITH CHECK (school_id = ANY(get_my_school_ids()));
