'use client';

import { MoreHorizontal, Eye, Pencil, UserX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Users } from 'lucide-react';

// -- Types --

export type StakeholderRole =
  | 'DEVELOPER'
  | 'GRID_OPERATOR'
  | 'TECHNICAL_BF'
  | 'COMMERCIAL_BF'
  | 'OPERATOR';

export interface StakeholderTenant {
  id: string;
  name: string;
}

export interface StakeholderPark {
  id: string;
  name: string;
}

export interface Stakeholder {
  id: string;
  stakeholderTenant: StakeholderTenant;
  park: StakeholderPark;
  role: StakeholderRole;
  feePercentage: number | null;
  billingEnabled: boolean;
  isActive: boolean;
}

export interface StakeholderTableProps {
  stakeholders: Stakeholder[];
  onView?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDeactivate?: (id: string) => void;
}

// -- Role display configuration --

const ROLE_LABELS: Record<StakeholderRole, string> = {
  DEVELOPER: 'Projektierer',
  GRID_OPERATOR: 'Netzbetreiber',
  TECHNICAL_BF: 'Techn. BF',
  COMMERCIAL_BF: 'Kaufm. BF',
  OPERATOR: 'Betreiber',
};

const ROLE_COLORS: Record<StakeholderRole, string> = {
  DEVELOPER: 'bg-purple-100 text-purple-800',
  GRID_OPERATOR: 'bg-blue-100 text-blue-800',
  TECHNICAL_BF: 'bg-orange-100 text-orange-800',
  COMMERCIAL_BF: 'bg-emerald-100 text-emerald-800',
  OPERATOR: 'bg-gray-100 text-gray-800',
};

/**
 * Table component displaying a list of management billing stakeholders.
 * Shows provider name, park, role, fee %, billing status, and actions.
 */
export function StakeholderTable({
  stakeholders,
  onView,
  onEdit,
  onDeactivate,
}: StakeholderTableProps) {
  if (stakeholders.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Keine Beteiligten vorhanden"
        description="Es wurden noch keine Beteiligten fuer die Verwaltungsabrechnung angelegt."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Dienstleister</TableHead>
          <TableHead>Park</TableHead>
          <TableHead>Rolle</TableHead>
          <TableHead className="text-right">Gebuehr %</TableHead>
          <TableHead>Abrechnung</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-[60px]">
            <span className="sr-only">Aktionen</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stakeholders.map((stakeholder) => (
          <TableRow
            key={stakeholder.id}
            className={!stakeholder.isActive ? 'opacity-60' : undefined}
          >
            {/* Provider name */}
            <TableCell className="font-medium">
              {stakeholder.stakeholderTenant.name}
            </TableCell>

            {/* Park name */}
            <TableCell>{stakeholder.park.name}</TableCell>

            {/* Role badge */}
            <TableCell>
              <Badge
                className={`${ROLE_COLORS[stakeholder.role]} border-transparent`}
              >
                {ROLE_LABELS[stakeholder.role]}
              </Badge>
            </TableCell>

            {/* Fee percentage */}
            <TableCell className="text-right font-mono">
              {stakeholder.feePercentage !== null
                ? `${stakeholder.feePercentage.toFixed(2)} %`
                : '-'}
            </TableCell>

            {/* Billing enabled */}
            <TableCell>
              <Badge
                className={
                  stakeholder.billingEnabled
                    ? 'bg-green-100 text-green-800 border-transparent'
                    : 'bg-gray-100 text-gray-800 border-transparent'
                }
              >
                {stakeholder.billingEnabled ? 'Aktiv' : 'Inaktiv'}
              </Badge>
            </TableCell>

            {/* Active status */}
            <TableCell>
              <Badge
                className={
                  stakeholder.isActive
                    ? 'bg-green-100 text-green-800 border-transparent'
                    : 'bg-red-100 text-red-800 border-transparent'
                }
              >
                {stakeholder.isActive ? 'Aktiv' : 'Deaktiviert'}
              </Badge>
            </TableCell>

            {/* Actions dropdown */}
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Aktionen</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => onView?.(stakeholder.id)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Anzeigen
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onEdit?.(stakeholder.id)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Bearbeiten
                  </DropdownMenuItem>
                  {stakeholder.isActive && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDeactivate?.(stakeholder.id)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <UserX className="mr-2 h-4 w-4" />
                        Deaktivieren
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
