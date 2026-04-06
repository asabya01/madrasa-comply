import { useSchoolStore } from '../stores/schoolStore';
import type { SchoolMemberRole } from '../types';

type Permission =
  | 'rate_indicator'
  | 'upload_evidence'
  | 'manage_evidence'
  | 'manage_improvement_plan'
  | 'view_reports'
  | 'generate_reports'
  | 'manage_audit_prep'
  | 'manage_school_settings'
  | 'manage_users'
  | 'invite_users'
  | 'assign_tasks'
  | 'view_self_evaluation'
  | 'edit_self_evaluation';

// Role → permission matrix
const ROLE_PERMISSIONS: Record<SchoolMemberRole, Permission[]> = {
  school_admin: [
    'rate_indicator', 'upload_evidence', 'manage_evidence',
    'manage_improvement_plan', 'view_reports', 'generate_reports',
    'manage_audit_prep', 'manage_school_settings', 'manage_users',
    'invite_users', 'assign_tasks', 'view_self_evaluation', 'edit_self_evaluation',
  ],
  principal: [
    'rate_indicator', 'upload_evidence', 'manage_evidence',
    'manage_improvement_plan', 'view_reports', 'generate_reports',
    'manage_audit_prep', 'manage_school_settings', 'invite_users',
    'assign_tasks', 'view_self_evaluation', 'edit_self_evaluation',
  ],
  vice_principal: [
    'rate_indicator', 'upload_evidence', 'manage_evidence',
    'manage_improvement_plan', 'view_reports', 'generate_reports',
    'manage_audit_prep', 'assign_tasks', 'view_self_evaluation', 'edit_self_evaluation',
  ],
  senior_management: [
    'rate_indicator', 'upload_evidence', 'manage_evidence',
    'manage_improvement_plan', 'view_reports', 'generate_reports',
    'assign_tasks', 'view_self_evaluation', 'edit_self_evaluation',
  ],
  head_of_department: [
    'rate_indicator', 'upload_evidence', 'manage_evidence',
    'manage_improvement_plan', 'view_reports',
    'view_self_evaluation', 'edit_self_evaluation',
  ],
  quality_coordinator: [
    'rate_indicator', 'upload_evidence', 'manage_evidence',
    'manage_improvement_plan', 'view_reports', 'generate_reports',
    'manage_audit_prep', 'assign_tasks', 'view_self_evaluation', 'edit_self_evaluation',
  ],
  teacher: [
    'rate_indicator', 'upload_evidence',
    'view_reports', 'view_self_evaluation',
  ],
  auditor: [
    'view_reports', 'view_self_evaluation',
  ],
};

export function usePermissions() {
  const { userRole, profile } = useSchoolStore();

  // Super admins bypass all permission checks
  const isSuperAdmin = profile?.is_super_admin ?? false;

  function can(permission: Permission): boolean {
    if (isSuperAdmin) return true;
    if (!userRole) return false;
    return ROLE_PERMISSIONS[userRole]?.includes(permission) ?? false;
  }

  function canAny(...permissions: Permission[]): boolean {
    return permissions.some((p) => can(p));
  }

  function canAll(...permissions: Permission[]): boolean {
    return permissions.every((p) => can(p));
  }

  return {
    can,
    canAny,
    canAll,
    userRole,
    isSuperAdmin,
  };
}
