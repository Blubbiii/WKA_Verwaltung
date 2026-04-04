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
  }>;
}

export interface PermissionCheck {
  hasPermission: boolean;
  resourceRestricted: boolean;
  allowedResourceIds: string[];
}
