import { useSchoolStore } from '../stores/schoolStore';

// ─── Role taxonomy ────────────────────────────────────────────
// These align to both profiles.role and school_members.role.

export type AppRole =
  | 'super_admin'
  | 'school_admin'
  | 'principal'
  | 'vice_principal'
  | 'senior_management'
  | 'head_of_department'
  | 'quality_coordinator'
  | 'teacher'
  | 'auditor';

// ─── Permission definitions (PSD Section 7.2) ────────────────

export interface Permissions {
  /** Platform-level: create/manage schools */
  canManageSchools: boolean;
  /** School-level: manage users and invitations */
  canManageUsers: boolean;
  /** Enter school-level indicator ratings (Domains 1, 2, 4, 5) */
  canRateSchoolIndicators: boolean;
  /** Enter Domain 3 teacher self-assessment ratings */
  canRateDomain3Indicators: boolean;
  /** Conduct and record classroom observations */
  canRecordObservations: boolean;
  /** Enter student proficiency / national exam data */
  canEnterStudentPerformance: boolean;
  /** Enter attendance data */
  canEnterAttendance: boolean;
  /** Upload evidence files */
  canUploadEvidence: boolean;
  /** Create and manage action items */
  canManageActionItems: boolean;
  /** View judgement calculations */
  canViewJudgements: boolean;
  /** Generate the Self-Evaluation Document */
  canGenerateSED: boolean;
  /** Export and download reports */
  canExportReports: boolean;
  /** Access AI feedback features */
  canUseAI: boolean;
  /** View billing / subscription settings */
  canManageBilling: boolean;
  /** Read-only external reviewer access */
  isExternalViewer: boolean;
}

const FULL_ADMIN_PERMS: Permissions = {
  canManageSchools: true,
  canManageUsers: true,
  canRateSchoolIndicators: true,
  canRateDomain3Indicators: true,
  canRecordObservations: true,
  canEnterStudentPerformance: true,
  canEnterAttendance: true,
  canUploadEvidence: true,
  canManageActionItems: true,
  canViewJudgements: true,
  canGenerateSED: true,
  canExportReports: true,
  canUseAI: true,
  canManageBilling: true,
  isExternalViewer: false,
};

const SCHOOL_ADMIN_PERMS: Permissions = {
  ...FULL_ADMIN_PERMS,
  canManageSchools: false,
  canManageBilling: false,
};

const HOD_PERMS: Permissions = {
  canManageSchools: false,
  canManageUsers: false,
  canRateSchoolIndicators: false,   // HOD cannot rate Domains 1,2,4,5 at school level
  canRateDomain3Indicators: true,
  canRecordObservations: true,
  canEnterStudentPerformance: true, // own subject only (enforced by UI/query filter)
  canEnterAttendance: false,
  canUploadEvidence: true,
  canManageActionItems: true,
  canViewJudgements: true,
  canGenerateSED: false,
  canExportReports: true,
  canUseAI: true,
  canManageBilling: false,
  isExternalViewer: false,
};

const TEACHER_PERMS: Permissions = {
  canManageSchools: false,
  canManageUsers: false,
  canRateSchoolIndicators: false,
  canRateDomain3Indicators: true,   // own classes only
  canRecordObservations: false,
  canEnterStudentPerformance: false,
  canEnterAttendance: false,
  canUploadEvidence: true,          // own indicators only
  canManageActionItems: false,
  canViewJudgements: true,          // own data only
  canGenerateSED: false,
  canExportReports: false,
  canUseAI: true,
  canManageBilling: false,
  isExternalViewer: false,
};

const EXTERNAL_VIEWER_PERMS: Permissions = {
  canManageSchools: false,
  canManageUsers: false,
  canRateSchoolIndicators: false,
  canRateDomain3Indicators: false,
  canRecordObservations: false,
  canEnterStudentPerformance: false,
  canEnterAttendance: false,
  canUploadEvidence: false,
  canManageActionItems: false,
  canViewJudgements: true,
  canGenerateSED: false,
  canExportReports: true,
  canUseAI: false,
  canManageBilling: false,
  isExternalViewer: true,
};

const NO_PERMS: Permissions = {
  canManageSchools: false,
  canManageUsers: false,
  canRateSchoolIndicators: false,
  canRateDomain3Indicators: false,
  canRecordObservations: false,
  canEnterStudentPerformance: false,
  canEnterAttendance: false,
  canUploadEvidence: false,
  canManageActionItems: false,
  canViewJudgements: false,
  canGenerateSED: false,
  canExportReports: false,
  canUseAI: false,
  canManageBilling: false,
  isExternalViewer: false,
};

// ─── Role → permissions mapping ───────────────────────────────

function roleToPermissions(role: string | null | undefined, isSuperAdmin: boolean): Permissions {
  if (isSuperAdmin) return FULL_ADMIN_PERMS;
  switch (role as AppRole) {
    case 'school_admin':
    case 'principal':
    case 'vice_principal':
    case 'quality_coordinator':
      return SCHOOL_ADMIN_PERMS;
    case 'senior_management':
      return { ...SCHOOL_ADMIN_PERMS, canManageBilling: false };
    case 'head_of_department':
      return HOD_PERMS;
    case 'teacher':
      return TEACHER_PERMS;
    case 'auditor':
      return EXTERNAL_VIEWER_PERMS;
    default:
      return NO_PERMS;
  }
}

// ─── Extended return type with boolean role flags ────────────

export interface PermissionsResult extends Permissions {
  /** True if profiles.is_super_admin = true */
  isSuperAdmin: boolean;
  /** True if role is school_admin, principal, vice_principal, or quality_coordinator */
  isSchoolAdmin: boolean;
  /** True if role is head_of_department or senior_management */
  isHOD: boolean;
  /** True if role is teacher */
  isTeacher: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────

export function usePermissions(): PermissionsResult {
  const { profile, userRole } = useSchoolStore();

  const isSuperAdmin  = Boolean(profile?.is_super_admin);
  const isSchoolAdmin = ['school_admin', 'principal', 'vice_principal', 'quality_coordinator'].includes(userRole ?? '');
  const isHOD         = ['head_of_department', 'senior_management'].includes(userRole ?? '');
  const isTeacher     = userRole === 'teacher';

  return {
    ...roleToPermissions(userRole, isSuperAdmin),
    isSuperAdmin,
    isSchoolAdmin,
    isHOD,
    isTeacher,
  };
}

// ─── Standalone helper (useful outside React components) ──────

export function getPermissionsForRole(
  role: string | null | undefined,
  isSuperAdmin = false
): Permissions {
  return roleToPermissions(role, isSuperAdmin);
}
