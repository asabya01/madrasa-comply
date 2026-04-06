export interface Domain {
  id: string;
  name_en: string;
  name_ar?: string;
  weight: 'high' | 'medium';
  key_category: string;
  order_num: number;
}

export interface Standard {
  id: string;
  domain_id: string;
  name_en: string;
  name_ar?: string;
  is_primary: boolean;
  order_num: number;
}

export interface Indicator {
  id: string;
  standard_id: string;
  domain_id: string;
  description_en: string;
  description_ar?: string;
  outstanding_descriptor?: string;
  satisfactory_descriptor?: string;
  key_evidence: string[];
  order_num: number;
}

export interface School {
  id: string;
  name_en: string;
  name_ar?: string;
  logo_url?: string;
  subscription_tier: 'trial' | 'basic' | 'premium' | 'starter' | 'school';
  subscription_status?: 'trial' | 'active' | 'suspended' | 'cancelled';
  invite_mode?: string;
  trial_ends_at?: string;
  is_active?: boolean;
  slug?: string;
  created_at: string;
  updated_at?: string;
  school_type?: string;
  governorate?: string;
  wilayat?: string;
  principal_name?: string;
  total_students_male?: number;
  total_students_female?: number;
  total_teachers?: number;
  school_levels?: string[];
  vision_statement?: string;
  mission_statement?: string;
}

export type SchoolMemberRole =
  | 'school_admin'
  | 'principal'
  | 'vice_principal'
  | 'senior_management'
  | 'head_of_department'
  | 'quality_coordinator'
  | 'teacher'
  | 'auditor';

export type SchoolMemberStatus = 'active' | 'pending' | 'suspended';

export interface SchoolMember {
  id: string;
  school_id: string;
  user_id: string;
  role: SchoolMemberRole;
  status: SchoolMemberStatus;
  invited_by?: string;
  joined_at: string;
  created_at: string;
  // joined from schools table when queried with select
  school?: School;
}

export interface Profile {
  id: string;
  school_id?: string;         // legacy — kept for backward compat
  email?: string;
  full_name?: string;
  // role is nullable — authoritative role is in school_members.role
  role?: 'admin' | 'super_admin' | 'principal' | 'vice_principal' | 'quality_coordinator' | 'teacher' | null;
  department?: string;
  avatar_url?: string;
  is_super_admin: boolean;
  created_at: string;
}

export interface SchoolInvitation {
  id: string;
  school_id: string;
  token: string;
  email?: string;
  role: SchoolMemberRole;
  invited_by?: string;
  expires_at: string;
  used_at?: string;
  created_at: string;
}

export interface Task {
  id: string;
  school_id: string;
  created_by?: string;
  assigned_to?: string;
  title: string;
  description?: string;
  indicator_id?: string;
  due_date?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'not_started' | 'in_progress' | 'completed' | 'overdue';
  is_broadcast: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppNotification {
  id: string;
  school_id: string;
  user_id: string;
  title: string;
  body?: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'task' | 'audit';
  related_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface IndicatorRating {
  id: string;
  school_id: string;
  indicator_id: string;
  academic_year: string;
  rating: number;
  strengths?: string;
  improvement_areas?: string;
  self_eval_notes?: string;
  rated_by?: string;
  rated_at: string;
}

export interface EvidenceFile {
  id: string;
  school_id: string;
  file_name: string;
  file_path: string;
  file_type?: string;
  file_size_bytes?: number;
  description?: string;
  evidence_date?: string;
  tags: string[];
  uploaded_by?: string;
  uploaded_at: string;
}

export interface EvidenceIndicatorLink {
  id: string;
  evidence_file_id: string;
  indicator_id: string;
  standard_id: string;
  domain_id: string;
  school_id: string;
  linked_at: string;
}

export interface ActionItem {
  id: string;
  school_id: string;
  title: string;
  description?: string;
  indicator_id?: string;
  standard_id?: string;
  domain_id?: string;
  owner_id?: string;
  due_date?: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'overdue';
  priority: 'critical' | 'high' | 'medium' | 'low';
  success_metric?: string;
  source: 'manual' | 'ai_generated' | 'audit_recommendation';
  academic_year?: string;
  created_by?: string;
  created_at: string;
  completed_at?: string;
}

export interface AIFeedback {
  id: string;
  school_id: string;
  feedback_scope: 'indicator' | 'standard' | 'domain' | 'overall';
  scope_id: string;
  academic_year?: string;
  rating_context?: Record<string, unknown>;
  feedback_text?: string;
  recommendations?: Array<{ action: string; priority: string; evidence_needed: string[] }>;
  reviewer_expectations?: string;
  priority?: string;
  generated_at: string;
  model_used: string;
}

export interface AuditChecklistItem {
  id: string;
  school_id: string;
  category: string;
  item_text: string;
  is_completed: boolean;
  notes?: string;
  completed_by?: string;
  completed_at?: string;
  is_custom: boolean;
}

export interface AuditSettings {
  id: string;
  school_id: string;
  expected_audit_date?: string;
  last_audit_date?: string;
  last_audit_judgement?: string;
  follow_up_required: boolean;
  follow_up_deadline?: string;
  notes?: string;
  updated_at: string;
}

export interface KpiSnapshot {
  id: string;
  school_id: string;
  snapshot_date: string;
  academic_year?: string;
  domain_scores: Record<string, number>;
  domain_judgements: Record<string, string>;
  overall_score: number;
  overall_judgement: string;
  indicators_rated: number;
  indicators_total: number;
  evidence_count: number;
  actions_completed: number;
  actions_total: number;
}
