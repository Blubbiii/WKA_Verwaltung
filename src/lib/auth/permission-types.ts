// ============================================================================
// Permission Types — shared between permissions.ts and permissionCache.ts
// Extracted to break circular dependency.
// ============================================================================

export interface UserPermissions {
  permissions: string[];
  roles: Array<{
    id: string;
    name: string;
    isSystem: boolean;
    resourceType: string;
    resourceIds: string[];
    permissions: string[];
    /** Tenant the role was granted for; null = global. */
    tenantId: string | null;
    hierarchy: number;
  }>;
}

export interface PermissionCheck {
  hasPermission: boolean;
  resourceRestricted: boolean;
  allowedResourceIds: string[];
}
