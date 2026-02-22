"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Permission {
  id: string;
  name: string;
  displayName: string;
  action: string;
  actionLabel: string;
}

interface ModuleGroup {
  module: string;
  label: string;
  permissions: Permission[];
}

interface PermissionMatrixProps {
  groupedPermissions: ModuleGroup[];
  selectedPermissions: string[];
  onTogglePermission: (permissionName: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

// Standard actions in display order
const actionOrder = ["read", "create", "update", "delete", "export", "download", "manage", "assign", "impersonate", "tenants", "system", "audit"];

export function PermissionMatrix({
  groupedPermissions,
  selectedPermissions,
  onTogglePermission,
  disabled = false,
  loading = false,
}: PermissionMatrixProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-5 w-32" />
            <div className="flex gap-4">
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="h-5 w-5" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Get all unique actions across all modules
  const allActions = new Set<string>();
  for (const group of groupedPermissions) {
    for (const perm of group.permissions) {
      allActions.add(perm.action);
    }
  }

  // Sort actions by predefined order
  const sortedActions = Array.from(allActions).sort((a, b) => {
    const aIdx = actionOrder.indexOf(a);
    const bIdx = actionOrder.indexOf(b);
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  // Get action label from first occurrence
  const actionLabels: Record<string, string> = {};
  for (const group of groupedPermissions) {
    for (const perm of group.permissions) {
      if (!actionLabels[perm.action]) {
        actionLabels[perm.action] = perm.actionLabel;
      }
    }
  }

  const toggleAll = (action: string) => {
    if (disabled) return;

    // Get all permissions for this action
    const actionPerms: string[] = [];
    for (const group of groupedPermissions) {
      const perm = group.permissions.find(p => p.action === action);
      if (perm) actionPerms.push(perm.name);
    }

    // Check if all are selected
    const allSelected = actionPerms.every(p => selectedPermissions.includes(p));

    // Toggle all
    for (const permName of actionPerms) {
      const isSelected = selectedPermissions.includes(permName);
      if (allSelected && isSelected) {
        onTogglePermission(permName);
      } else if (!allSelected && !isSelected) {
        onTogglePermission(permName);
      }
    }
  };

  const toggleModuleAll = (module: string) => {
    if (disabled) return;

    const group = groupedPermissions.find(g => g.module === module);
    if (!group) return;

    const modulePerms = group.permissions.map(p => p.name);
    const allSelected = modulePerms.every(p => selectedPermissions.includes(p));

    for (const permName of modulePerms) {
      const isSelected = selectedPermissions.includes(permName);
      if (allSelected && isSelected) {
        onTogglePermission(permName);
      } else if (!allSelected && !isSelected) {
        onTogglePermission(permName);
      }
    }
  };

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left p-3 font-medium min-w-[150px]">Modul</th>
              {sortedActions.map(action => (
                <th
                  key={action}
                  className="text-center p-3 font-medium min-w-[90px] cursor-pointer hover:bg-muted/70 transition-colors"
                  onClick={() => toggleAll(action)}
                  title={`Alle "${actionLabels[action]}" umschalten`}
                >
                  <span className="text-xs">{actionLabels[action]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupedPermissions.map((group, idx) => {
              const modulePerms = group.permissions.map(p => p.name);
              const selectedCount = modulePerms.filter(p => selectedPermissions.includes(p)).length;
              const allModuleSelected = selectedCount === modulePerms.length;
              const someModuleSelected = selectedCount > 0 && selectedCount < modulePerms.length;

              return (
                <tr
                  key={group.module}
                  className={`border-b last:border-b-0 ${idx % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={allModuleSelected}
                        ref={(el) => {
                          if (el) {
                            (el as HTMLButtonElement & { indeterminate: boolean }).indeterminate = someModuleSelected;
                          }
                        }}
                        onCheckedChange={() => toggleModuleAll(group.module)}
                        disabled={disabled}
                      />
                      <span className="font-medium">{group.label}</span>
                      <Badge variant="outline" className="text-xs">
                        {selectedCount}/{modulePerms.length}
                      </Badge>
                    </div>
                  </td>
                  {sortedActions.map(action => {
                    const perm = group.permissions.find(p => p.action === action);
                    if (!perm) {
                      return <td key={action} className="text-center p-3 text-muted-foreground">-</td>;
                    }

                    const isSelected = selectedPermissions.includes(perm.name);

                    return (
                      <td key={action} className="text-center p-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => onTogglePermission(perm.name)}
                          disabled={disabled}
                          title={perm.displayName}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="bg-muted/30 p-3 border-t flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {selectedPermissions.length} von {groupedPermissions.reduce((acc, g) => acc + g.permissions.length, 0)} Berechtigungen ausgewählt
        </span>
        {disabled && (
          <Badge variant="secondary">Nur Ansicht</Badge>
        )}
      </div>
    </div>
  );
}
