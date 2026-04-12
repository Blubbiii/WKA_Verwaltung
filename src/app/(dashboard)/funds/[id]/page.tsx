"use client";

import { useState, useEffect, use } from "react";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";
import { de } from "date-fns/locale";
import {
  ArrowLeft,
  Pencil,
  Building2,
  Users,
  Wallet,
  Wind,
  Vote,
  Plus,
  MoreHorizontal,
  UserPlus,
  UserMinus,
  RefreshCw,
  Loader2,
  Trash2,
  Banknote,
  Check,
  Play,
  Eye,
  CalendarIcon,
  Shield,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BatchActionBar } from "@/components/ui/batch-action-bar";
import { useBatchSelection } from "@/hooks/useBatchSelection";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useDistributions,
  createDistribution,
  executeDistribution,
  deleteDistribution,
  distributionStatusLabels,
  distributionStatusColors,
  type Distribution,
} from "@/hooks/useDistributions";
import {
  ShareholderDialogs,
  CreatePortalAccessDialog,
  RemovePortalAccessDialog,
  PasswordDisplayDialog,
  FundHierarchyChart,
} from "@/components/funds";
import { DocumentPreviewDialog } from "@/components/documents";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface Shareholder {
  id: string;
  shareholderNumber: string | null;
  capitalContribution: number | null;
  ownershipPercentage: number | null;
  votingRightsPercentage: number | null;
  distributionPercentage: number | null;
  entryDate: string | null;
  exitDate: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  notes: string | null;
  userId: string | null;
  user: {
    id: string;
    email: string;
  } | null;
  person: {
    id: string;
    personType: "natural" | "legal";
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    street: string | null;
    houseNumber: string | null;
    postalCode: string | null;
    city: string | null;
  };
}

interface FundPark {
  park: {
    id: string;
    name: string;
    shortName: string | null;
    status: string;
    _count: { turbines: number };
  };
  ownershipPercentage: number | null;
}

interface FundHierarchyEntry {
  id: string;
  ownershipPercentage: number | null;
  validFrom: string;
  validTo: string | null;
  notes: string | null;
  createdAt: string;
  parentFund?: {
    id: string;
    name: string;
    legalForm: string | null;
    fundCategory: { id: string; name: string; code: string; color: string } | null;
  };
  childFund?: {
    id: string;
    name: string;
    legalForm: string | null;
    fundCategory: { id: string; name: string; code: string; color: string } | null;
  };
}

interface OperatedTurbine {
  id: string;
  ownershipPercentage: number | null;
  validFrom: string;
  validTo: string | null;
  status: string;
  turbine: {
    id: string;
    designation: string;
    manufacturer: string | null;
    model: string | null;
    ratedPowerKw: number | null;
    status: string;
    park: { id: string; name: string };
  };
}

interface AvailableFund {
  id: string;
  name: string;
  legalForm: string | null;
}

interface AvailableTurbine {
  id: string;
  designation: string;
  manufacturer: string | null;
  model: string | null;
  ratedPowerKw: number | null;
}

interface Fund {
  id: string;
  name: string;
  legalForm: string | null;
  fundCategory?: { id: string; name: string; code: string; color: string } | null;
  registrationNumber: string | null;
  registrationCourt: string | null;
  foundingDate: string | null;
  totalCapital: number | null;
  managingDirector: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  bankDetails: {
    iban?: string;
    bic?: string;
    bankName?: string;
  };
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  shareholders: Shareholder[];
  fundParks: FundPark[];
  parentHierarchies: FundHierarchyEntry[];
  childHierarchies: FundHierarchyEntry[];
  operatedTurbines: OperatedTurbine[];
  votes: Array<{
    id: string;
    title: string;
    status: string;
    startDate: string;
    endDate: string;
  }>;
  documents: Array<{
    id: string;
    title: string;
    fileName: string;
    fileUrl: string;
    mimeType: string | null;
    category: string;
    createdAt: string;
  }>;
  stats: {
    shareholderCount: number;
    activeShareholderCount: number;
    totalContributions: number;
    totalOwnership: number;
    voteCount: number;
    documentCount: number;
    parkCount: number;
    hierarchyCount: number;
    operatedTurbineCount: number;
    invoiceCount: number;
  };
}

const statusColors = {
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  INACTIVE:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  ARCHIVED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

export default function FundDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const t = useTranslations("funds");
  const { flags } = useFeatureFlags();
  const [fund, setFund] = useState<Fund | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [activeTab, setActiveTab] = useState("shareholders");

  // Hierarchy dialog state
  const [isAddHierarchyDialogOpen, setIsAddHierarchyDialogOpen] = useState(false);
  const [availableFunds, setAvailableFunds] = useState<AvailableFund[]>([]);
  const [selectedHierarchyFundId, setSelectedHierarchyFundId] = useState<string>("");
  const [hierarchyOwnership, setHierarchyOwnership] = useState<string>("");
  const [hierarchyValidFrom, setHierarchyValidFrom] = useState<Date>(new Date());
  const [isAddingHierarchy, setIsAddingHierarchy] = useState(false);
  const [deleteHierarchyDialogOpen, setDeleteHierarchyDialogOpen] = useState(false);
  const [hierarchyToDelete, setHierarchyToDelete] = useState<string | null>(null);
  const [, setIsDeletingHierarchy] = useState(false);

  // Turbine operator dialog state
  const [isAddTurbineDialogOpen, setIsAddTurbineDialogOpen] = useState(false);
  const [availableTurbines, setAvailableTurbines] = useState<AvailableTurbine[]>([]);
  const [availableParksForTurbine, setAvailableParksForTurbine] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedParkForTurbine, setSelectedParkForTurbine] = useState<string>("");
  const [selectedTurbineId, setSelectedTurbineId] = useState<string>("");
  const [turbineOwnership, setTurbineOwnership] = useState<string>("100");
  const [turbineValidFrom, setTurbineValidFrom] = useState<Date>(new Date());
  const [isAddingTurbine, setIsAddingTurbine] = useState(false);

  // Distribution state
  const [isDistributionDialogOpen, setIsDistributionDialogOpen] = useState(false);
  const [distributionAmount, setDistributionAmount] = useState<string>("");
  const [distributionDescription, setDistributionDescription] = useState<string>("");
  const [distributionDate, setDistributionDate] = useState<Date>(new Date());
  const [isCreatingDistribution, setIsCreatingDistribution] = useState(false);
  const [isExecutingDistribution, setIsExecutingDistribution] = useState<string | null>(null);
  const [isDeletingDistribution, setIsDeletingDistribution] = useState<string | null>(null);
  const [selectedDistribution, setSelectedDistribution] = useState<Distribution | null>(null);
  const [isDistributionDetailOpen, setIsDistributionDetailOpen] = useState(false);

  // Execute distribution dialog state
  const [executeDistDialogOpen, setExecuteDistDialogOpen] = useState(false);
  const [distToExecute, setDistToExecute] = useState<string | null>(null);

  // Delete distribution dialog state
  const [deleteDistDialogOpen, setDeleteDistDialogOpen] = useState(false);
  const [distToDelete, setDistToDelete] = useState<string | null>(null);

  // Shareholder dialog state
  const [isAddShareholderOpen, setIsAddShareholderOpen] = useState(false);
  const [isEditShareholderOpen, setIsEditShareholderOpen] = useState(false);
  const [isShareholderDetailOpen, setIsShareholderDetailOpen] = useState(false);
  const [selectedShareholder, setSelectedShareholder] = useState<Shareholder | null>(null);

  // Delete shareholder state
  const [isDeleteShareholderDialogOpen, setIsDeleteShareholderDialogOpen] = useState(false);
  const [shareholderToDelete, setShareholderToDelete] = useState<Shareholder | null>(null);
  const [isDeletingShareholder, setIsDeletingShareholder] = useState(false);

  // Document preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<Fund["documents"][0] | null>(null);

  // Portal access state
  const [isCreatePortalAccessOpen, setIsCreatePortalAccessOpen] = useState(false);
  const [isRemovePortalAccessOpen, setIsRemovePortalAccessOpen] = useState(false);
  const [isPasswordDisplayOpen, setIsPasswordDisplayOpen] = useState(false);
  const [portalAccessShareholder, setPortalAccessShareholder] = useState<Shareholder | null>(null);
  const [portalCredentials, setPortalCredentials] = useState<{ email: string; temporaryPassword: string } | null>(null);

  // Batch selection for shareholders
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const shareholders = fund?.shareholders ?? [];
  const {
    selectedIds: selectedShareholderIds,
    isAllSelected: isAllShareholdersSelected,
    isSomeSelected: isSomeShareholdersSelected,
    toggleItem: toggleShareholderItem,
    toggleAll: toggleAllShareholders,
    clearSelection: clearShareholderSelection,
    selectedCount: selectedShareholderCount,
  } = useBatchSelection({ items: shareholders });

  // Clear shareholder selection when switching tabs
  useEffect(() => {
    if (activeTab !== "shareholders") {
      clearShareholderSelection();
    }
  }, [activeTab, clearShareholderSelection]);

  // Distributions hook
  const { distributions, isLoading: distributionsLoading, mutate: mutateDistributions } = useDistributions(id);

  useEffect(() => {
    fetchFund();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (isAddHierarchyDialogOpen) {
      fetchAvailableFunds();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAddHierarchyDialogOpen]);

  useEffect(() => {
    if (isAddTurbineDialogOpen) {
      fetchAvailableParksForTurbine();
    }
  }, [isAddTurbineDialogOpen]);

  useEffect(() => {
    if (selectedParkForTurbine) {
      fetchTurbinesForPark(selectedParkForTurbine);
    } else {
      setAvailableTurbines([]);
    }
  }, [selectedParkForTurbine]);

  async function fetchFund() {
    try {
      setLoading(true);
      const response = await fetch(`/api/funds/${id}`);
      if (!response.ok) {
        if (response.status === 404) {
          setError(t("detail.errorNotFound"));
        } else {
          throw new Error(t("detail.errorLoadGeneric"));
        }
        return;
      }
      const data = await response.json();
      setFund(data);
    } catch {
      setError(t("detail.errorLoading"));
    } finally {
      setLoading(false);
    }
  }

  async function recalculateShares() {
    try {
      setIsRecalculating(true);
      const response = await fetch(`/api/funds/${id}/recalculate`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(t("detail.recalcError"));
      }
      // Reload fund data to show updated percentages
      await fetchFund();
    } catch {
      toast.error(t("detail.recalculateError"));
    } finally {
      setIsRecalculating(false);
    }
  }

  async function fetchAvailableFunds() {
    try {
      const response = await fetch("/api/funds?limit=200");
      if (response.ok) {
        const data = await response.json();
        // Collect IDs of already-linked funds
        const linkedIds = new Set<string>();
        linkedIds.add(id); // Exclude current fund
        if (fund) {
          // parentHierarchies = THIS fund is child → other fund is parentFund
          fund.parentHierarchies.forEach((h) => {
            if (h.parentFund?.id) linkedIds.add(h.parentFund.id);
          });
          // childHierarchies = THIS fund is parent → other fund is childFund
          fund.childHierarchies.forEach((h) => {
            if (h.childFund?.id) linkedIds.add(h.childFund.id);
          });
        }
        const available = (data.data || []).filter(
          (f: AvailableFund) => !linkedIds.has(f.id)
        );
        setAvailableFunds(available);
      }
    } catch {
    }
  }

  async function fetchAvailableParksForTurbine() {
    try {
      const response = await fetch("/api/parks");
      if (response.ok) {
        const data = await response.json();
        setAvailableParksForTurbine(data.data || []);
      }
    } catch {
    }
  }

  async function fetchTurbinesForPark(parkId: string) {
    try {
      const response = await fetch(`/api/turbines?parkId=${parkId}&limit=200`);
      if (response.ok) {
        const data = await response.json();
        setAvailableTurbines(data.data || []);
      }
    } catch {
    }
  }

  async function handleAddHierarchy() {
    if (!selectedHierarchyFundId) return;

    if (selectedHierarchyFundId === id) {
      toast.error(t("detail.selfLinkError"));
      return;
    }

    try {
      setIsAddingHierarchy(true);
      // Current fund is parent, selected fund is child (Gesellschafter)
      const body = {
        parentFundId: id,
        childFundId: selectedHierarchyFundId,
        ownershipPercentage: hierarchyOwnership ? parseFloat(hierarchyOwnership) : 0,
        validFrom: hierarchyValidFrom.toISOString(),
      };

      const response = await fetch("/api/funds/hierarchy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || t("detail.linkError"));
      }

      setSelectedHierarchyFundId("");
      setHierarchyOwnership("");
      setHierarchyValidFrom(new Date());
      setIsAddHierarchyDialogOpen(false);
      toast.success(t("detail.linkSuccess"));
      await fetchFund();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("detail.linkError"));
    } finally {
      setIsAddingHierarchy(false);
    }
  }

  function openDeleteHierarchyDialog(hierarchyId: string) {
    setHierarchyToDelete(hierarchyId);
    setDeleteHierarchyDialogOpen(true);
  }

  async function handleConfirmDeleteHierarchy() {
    if (!hierarchyToDelete) return;

    try {
      setIsDeletingHierarchy(true);
      const response = await fetch(`/api/funds/hierarchy/${hierarchyToDelete}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t("detail.removeError"));
      }

      toast.success(t("detail.removeLinkSuccess"));
      await fetchFund();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("detail.removeLinkError"));
    } finally {
      setIsDeletingHierarchy(false);
      setDeleteHierarchyDialogOpen(false);
      setHierarchyToDelete(null);
    }
  }

  async function handleAddTurbineOperator() {
    if (!selectedTurbineId) return;

    try {
      setIsAddingTurbine(true);
      const body = {
        turbineId: selectedTurbineId,
        operatorFundId: id,
        ownershipPercentage: turbineOwnership ? parseFloat(turbineOwnership) : 100,
        validFrom: turbineValidFrom.toISOString(),
      };

      const response = await fetch("/api/energy/turbine-operators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || t("detail.assignError"));
      }

      setSelectedTurbineId("");
      setSelectedParkForTurbine("");
      setTurbineOwnership("100");
      setTurbineValidFrom(new Date());
      setIsAddTurbineDialogOpen(false);
      toast.success(t("detail.assignSuccess"));
      await fetchFund();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("detail.assignError"));
    } finally {
      setIsAddingTurbine(false);
    }
  }

  function getPersonName(person: Shareholder["person"]): string {
    if (person.personType === "legal") {
      return person.companyName || "-";
    }
    return [person.firstName, person.lastName].filter(Boolean).join(" ") || "-";
  }

  // Batch: export selected shareholders as CSV
  function handleBatchExportShareholders() {
    const selected = shareholders.filter((sh) => selectedShareholderIds.has(sh.id));
    if (selected.length === 0) return;

    const header = [
      t("detail.batchExportCsvHeaders.number"),
      t("detail.batchExportCsvHeaders.name"),
      t("detail.batchExportCsvHeaders.type"),
      t("detail.batchExportCsvHeaders.email"),
      t("detail.batchExportCsvHeaders.phone"),
      t("detail.batchExportCsvHeaders.contribution"),
      t("detail.batchExportCsvHeaders.share"),
      t("detail.batchExportCsvHeaders.status"),
    ];
    const rows = selected.map((sh) => [
      sh.shareholderNumber || "",
      getPersonName(sh.person),
      sh.person.personType === "legal" ? t("detail.batchExportTypeLegal") : t("detail.batchExportTypeNatural"),
      sh.person.email || "",
      sh.person.phone || "",
      sh.capitalContribution != null ? sh.capitalContribution.toFixed(2).replace(".", ",") : "",
      sh.ownershipPercentage != null ? `${Number(sh.ownershipPercentage).toFixed(2)}%` : "",
      sh.status,
    ]);

    const csvContent =
      "\uFEFF" +
      [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gesellschafter-${fund?.name || "export"}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success(t("detail.batchExportSuccess", { count: selected.length }));
  }

  // Batch: enable portal access for selected shareholders
  async function handleBatchEnablePortalAccess() {
    const withoutPortal = shareholders.filter(
      (sh) => selectedShareholderIds.has(sh.id) && !sh.userId && sh.person.email
    );

    if (withoutPortal.length === 0) {
      toast.error(t("detail.batchPortalNoSuitable"));
      return;
    }

    setIsBatchProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (const sh of withoutPortal) {
      try {
        const response = await fetch(`/api/shareholders/${sh.id}/portal-access`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: sh.person.email }),
        });
        if (response.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    setIsBatchProcessing(false);
    clearShareholderSelection();
    fetchFund();

    if (failCount === 0) {
      toast.success(t("detail.batchPortalSuccess", { count: successCount }));
    } else {
      toast.warning(t("detail.batchPortalPartial", { success: successCount, fail: failCount }));
    }
  }

  // Calculate distribution preview for each shareholder
  function calculateDistributionPreview(totalAmount: number) {
    if (!fund?.shareholders || fund.shareholders.length === 0) return [];

    const activeShareholders = fund.shareholders.filter(sh => sh.status === "ACTIVE");
    const totalPercentage = activeShareholders.reduce(
      (sum, sh) => sum + (Number(sh.ownershipPercentage) || 0),
      0
    );

    if (totalPercentage === 0) return [];

    return activeShareholders.map(sh => {
      const percentage = Number(sh.ownershipPercentage) || 0;
      const normalizedPercentage = (percentage / totalPercentage) * 100;
      const amount = Math.round((totalAmount * normalizedPercentage / 100) * 100) / 100;
      return {
        shareholder: sh,
        percentage: normalizedPercentage,
        amount,
      };
    });
  }

  async function handleCreateDistribution() {
    const amount = parseFloat(distributionAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error(t("detail.invalidAmount"));
      return;
    }

    try {
      setIsCreatingDistribution(true);
      await createDistribution(id, {
        totalAmount: amount,
        description: distributionDescription || undefined,
        distributionDate: format(distributionDate, "yyyy-MM-dd"),
      });

      toast.success(t("detail.createDistributionSuccess"));
      setIsDistributionDialogOpen(false);
      setDistributionAmount("");
      setDistributionDescription("");
      setDistributionDate(new Date());
      mutateDistributions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("detail.createDistributionError"));
    } finally {
      setIsCreatingDistribution(false);
    }
  }

  function handleExecuteDistribution(distributionId: string) {
    setDistToExecute(distributionId);
    setExecuteDistDialogOpen(true);
  }

  async function handleConfirmExecuteDistribution() {
    if (!distToExecute) return;

    try {
      setIsExecutingDistribution(distToExecute);
      await executeDistribution(id, distToExecute);
      toast.success(t("detail.executeDistSuccess"));
      mutateDistributions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("detail.executeDistError"));
    } finally {
      setIsExecutingDistribution(null);
      setExecuteDistDialogOpen(false);
      setDistToExecute(null);
    }
  }

  function handleDeleteDistribution(distributionId: string) {
    setDistToDelete(distributionId);
    setDeleteDistDialogOpen(true);
  }

  async function handleConfirmDeleteDistribution() {
    if (!distToDelete) return;

    try {
      setIsDeletingDistribution(distToDelete);
      await deleteDistribution(id, distToDelete);
      toast.success(t("detail.deleteDistSuccess"));
      mutateDistributions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("detail.deleteDistError"));
    } finally {
      setIsDeletingDistribution(null);
      setDeleteDistDialogOpen(false);
      setDistToDelete(null);
    }
  }

  function openDistributionDetail(distribution: Distribution) {
    setSelectedDistribution(distribution);
    setIsDistributionDetailOpen(true);
  }

  function openDeleteShareholderDialog(shareholder: Shareholder) {
    setShareholderToDelete(shareholder);
    setIsDeleteShareholderDialogOpen(true);
  }

  async function handleDeleteShareholder() {
    if (!shareholderToDelete) return;

    try {
      setIsDeletingShareholder(true);
      const response = await fetch(`/api/shareholders/${shareholderToDelete.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success(t("detail.deleteShSuccess"));
        setIsDeleteShareholderDialogOpen(false);
        setShareholderToDelete(null);
        fetchFund();
      } else {
        const error = await response.json();
        toast.error(error.error || t("detail.deleteShErrorGeneric"));
      }
    } catch {
      toast.error(t("detail.deleteShError"));
    } finally {
      setIsDeletingShareholder(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="mt-2 h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !fund) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-lg text-muted-foreground">{error}</p>
        <Button asChild className="mt-4">
          <Link href="/funds">{t("detail.backToList")}</Link>
        </Button>
      </div>
    );
  }

  const statusLabels = {
    ACTIVE: t("status.active"),
    INACTIVE: t("status.inactive"),
    ARCHIVED: t("status.archived"),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/funds">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{fund.name}</h1>
              <Badge variant="secondary" className={statusColors[fund.status]}>
                {statusLabels[fund.status]}
              </Badge>
            </div>
            {fund.legalForm && (
              <p className="text-muted-foreground">{fund.legalForm}</p>
            )}
          </div>
        </div>
        <Button asChild>
          <Link href={`/funds/${id}/edit`}>
            <Pencil className="mr-2 h-4 w-4" />
            {t("detail.edit")}
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium">{t("detail.statsShareholders")}</CardTitle>
              <InfoTooltip text={t("detail.statsShareholdersTooltip")} />
            </div>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {fund.stats.activeShareholderCount}
            </div>
            <p className="text-xs text-muted-foreground">{t("detail.statsShareholdersSubtitle")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium">{t("detail.statsCapital")}</CardTitle>
              <InfoTooltip text={t("detail.statsCapitalTooltip")} />
            </div>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {fund.stats.totalContributions > 0
                ? formatCurrency(fund.stats.totalContributions)
                : "-"}
            </div>
            <p className="text-xs text-muted-foreground">{t("detail.statsCapitalSubtitle")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium">{t("detail.statsCompanies")}</CardTitle>
              <InfoTooltip text={t("detail.statsCompaniesTooltip")} />
            </div>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fund.stats.hierarchyCount}</div>
            <p className="text-xs text-muted-foreground">{t("detail.statsCompaniesSubtitle")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium">{t("detail.statsTurbines")}</CardTitle>
              <InfoTooltip text={t("detail.statsTurbinesTooltip")} />
            </div>
            <Wind className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fund.stats.operatedTurbineCount}</div>
            <p className="text-xs text-muted-foreground">{t("detail.statsTurbinesSubtitle")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium">{t("detail.statsVotes")}</CardTitle>
              <InfoTooltip text={t("detail.statsVotesTooltip")} />
            </div>
            <Vote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fund.stats.voteCount}</div>
            <p className="text-xs text-muted-foreground">{t("detail.statsVotesSubtitle")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="shareholders">
            {t("detail.tabShareholders")} ({fund.stats.activeShareholderCount})
          </TabsTrigger>
          <TabsTrigger value="overview">{t("detail.tabOverview")}</TabsTrigger>
          <TabsTrigger value="distributions">
            <Banknote className="mr-2 h-4 w-4" />
            {t("detail.tabDistributions")} ({distributions?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="companies">
            {t("detail.tabCompanies")} ({fund.stats.hierarchyCount})
          </TabsTrigger>
          <TabsTrigger value="turbines">
            {t("detail.tabTurbines")} ({fund.stats.operatedTurbineCount})
          </TabsTrigger>
          <TabsTrigger value="documents">
            {t("detail.tabDocuments")} ({fund.stats.documentCount})
          </TabsTrigger>
          {flags.crm && <TabsTrigger value="activities">{t("detail.tabActivities")}</TabsTrigger>}
        </TabsList>

        {/* Shareholders Tab */}
        <TabsContent value="shareholders">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle>{t("detail.shareholdersTitle")}</CardTitle>
                  <InfoTooltip text={t("detail.shareholdersTooltip")} />
                </div>
                <CardDescription>
                  {t("detail.shareholdersDescription")}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={recalculateShares}
                  disabled={isRecalculating}
                >
                  {isRecalculating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  {t("detail.recalculateQuotas")}
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/funds/onboarding">
                    <UserPlus className="mr-2 h-4 w-4" />
                    {t("detail.onboardingWizard")}
                  </Link>
                </Button>
                <Button onClick={() => setIsAddShareholderOpen(true)}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  {t("detail.addShareholder")}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {fund.shareholders.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  {t("detail.noShareholders")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={isAllShareholdersSelected}
                          ref={(el) => {
                            if (el) {
                              (el as unknown as HTMLInputElement).indeterminate = isSomeShareholdersSelected;
                            }
                          }}
                          onCheckedChange={toggleAllShareholders}
                          aria-label={t("detail.selectAllShareholders")}
                        />
                      </TableHead>
                      <TableHead>{t("detail.colNumber")}</TableHead>
                      <TableHead>{t("detail.colName")}</TableHead>
                      <TableHead>{t("detail.colContact")}</TableHead>
                      <TableHead className="text-right">{t("detail.colContribution")}</TableHead>
                      <TableHead className="text-right">{t("detail.colShare")}</TableHead>
                      <TableHead>{t("detail.colStatus")}</TableHead>
                      <TableHead>{t("detail.colPortal")}</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fund.shareholders.map((sh) => (
                      <TableRow
                        key={sh.id}
                        className={selectedShareholderIds.has(sh.id) ? "bg-primary/5" : ""}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedShareholderIds.has(sh.id)}
                            onCheckedChange={() => toggleShareholderItem(sh.id)}
                            aria-label={t("detail.selectShareholder", { name: getPersonName(sh.person) })}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {sh.shareholderNumber || "-"}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {getPersonName(sh.person)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {sh.person.personType === "legal"
                              ? t("detail.personTypeLegal")
                              : t("detail.personTypeNatural")}
                          </div>
                        </TableCell>
                        <TableCell>
                          {sh.person.email && (
                            <div className="text-sm">{sh.person.email}</div>
                          )}
                          {sh.person.phone && (
                            <div className="text-sm text-muted-foreground">
                              {sh.person.phone}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {sh.capitalContribution
                            ? formatCurrency(sh.capitalContribution)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {sh.ownershipPercentage != null
                            ? `${Number(sh.ownershipPercentage).toFixed(2)}%`
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={statusColors[sh.status]}
                          >
                            {statusLabels[sh.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {sh.userId ? (
                            <Badge
                              variant="secondary"
                              className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            >
                              <Shield className="mr-1 h-3 w-3" />
                              {t("detail.portalActive")}
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                            >
                              {t("detail.portalNone")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedShareholder(sh);
                                  setIsShareholderDetailOpen(true);
                                }}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                {t("detail.view")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedShareholder(sh);
                                  setIsEditShareholderOpen(true);
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                {t("detail.editSh")}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {sh.userId ? (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setPortalAccessShareholder(sh);
                                    setIsRemovePortalAccessOpen(true);
                                  }}
                                  className="text-red-600"
                                >
                                  <UserMinus className="mr-2 h-4 w-4" />
                                  {t("detail.removePortalAccess")}
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setPortalAccessShareholder(sh);
                                    setIsCreatePortalAccessOpen(true);
                                  }}
                                >
                                  <Shield className="mr-2 h-4 w-4" />
                                  {t("detail.createPortalAccess")}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => openDeleteShareholderDialog(sh)}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t("detail.deleteSh")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Overview Tab */}
        <TabsContent value="overview">
          {(fund.parentHierarchies.length > 0 || fund.childHierarchies.length > 0 || fund.operatedTurbines.length > 0) && (
            <div className="mb-6">
              <FundHierarchyChart
                currentFund={{
                  id: fund.id,
                  name: fund.name,
                  legalForm: fund.legalForm,
                  fundCategory: fund.fundCategory,
                }}
                parentFunds={fund.parentHierarchies
                  .filter((h) => h.parentFund)
                  .map((h) => ({
                    fund: h.parentFund!,
                    ownershipPercentage: h.ownershipPercentage,
                  }))}
                childFunds={fund.childHierarchies
                  .filter((h) => h.childFund)
                  .map((h) => ({
                    fund: h.childFund!,
                    ownershipPercentage: h.ownershipPercentage,
                  }))}
                operatedTurbines={fund.operatedTurbines}
              />
            </div>
          )}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>{t("detail.companyDataTitle")}</CardTitle>
                  <InfoTooltip text={t("detail.companyDataTooltip")} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {t("detail.legalForm")}
                    </p>
                    <p>{fund.legalForm || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {t("detail.totalCapital")}
                    </p>
                    <p>
                      {fund.totalCapital
                        ? formatCurrency(fund.totalCapital)
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {t("detail.registrationNumber")}
                    </p>
                    <p>{fund.registrationNumber || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {t("detail.registrationCourt")}
                    </p>
                    <p>{fund.registrationCourt || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {t("detail.foundingDate")}
                    </p>
                    <p>
                      {fund.foundingDate
                        ? format(new Date(fund.foundingDate), "dd.MM.yyyy", {
                            locale: de,
                          })
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {t("detail.managingDirector")}
                    </p>
                    <p>{fund.managingDirector || "-"}</p>
                  </div>
                </div>
                {(fund.street || fund.houseNumber || fund.postalCode || fund.city) && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {t("detail.address")}
                      </p>
                      <p>
                        {[fund.street, fund.houseNumber].filter(Boolean).join(" ")}
                        {(fund.street || fund.houseNumber) && (fund.postalCode || fund.city) && <br />}
                        {[fund.postalCode, fund.city].filter(Boolean).join(" ")}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>{t("detail.bankDetailsTitle")}</CardTitle>
                  <InfoTooltip text={t("detail.bankDetailsTooltip")} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {t("detail.iban")}
                    </p>
                    <p className="font-mono">{fund.bankDetails?.iban || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {t("detail.bic")}
                    </p>
                    <p className="font-mono">{fund.bankDetails?.bic || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {t("detail.bank")}
                    </p>
                    <p>{fund.bankDetails?.bankName || "-"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Distributions Tab */}
        <TabsContent value="distributions">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle>{t("detail.distributionsTitle")}</CardTitle>
                  <InfoTooltip text={t("detail.distributionsTooltip")} />
                </div>
                <CardDescription>
                  {t("detail.distributionsDescription")}
                </CardDescription>
              </div>
              <Button onClick={() => setIsDistributionDialogOpen(true)}>
                <Banknote className="mr-2 h-4 w-4" />
                {t("detail.distribute")}
              </Button>
            </CardHeader>
            <CardContent>
              {distributionsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : !distributions || distributions.length === 0 ? (
                <div className="py-12 text-center">
                  <Banknote className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-muted-foreground">
                    {t("detail.noDistributions")}
                  </p>
                  <Button
                    className="mt-4"
                    onClick={() => setIsDistributionDialogOpen(true)}
                  >
                    <Banknote className="mr-2 h-4 w-4" />
                    {t("detail.firstDistribution")}
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("detail.distColNumber")}</TableHead>
                      <TableHead>{t("detail.distColDescription")}</TableHead>
                      <TableHead>{t("detail.distColDate")}</TableHead>
                      <TableHead className="text-right">{t("detail.distColAmount")}</TableHead>
                      <TableHead>{t("detail.distColStatus")}</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {distributions.map((dist) => (
                      <TableRow key={dist.id}>
                        <TableCell className="font-mono text-sm">
                          {dist.distributionNumber}
                        </TableCell>
                        <TableCell>{dist.description || "-"}</TableCell>
                        <TableCell>
                          {format(new Date(dist.distributionDate), "dd.MM.yyyy", {
                            locale: de,
                          })}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(Number(dist.totalAmount))}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={distributionStatusColors[dist.status]}
                          >
                            {distributionStatusLabels[dist.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDistributionDetail(dist)}
                              title={t("detail.view")}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {dist.status === "DRAFT" && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleExecuteDistribution(dist.id)}
                                  disabled={isExecutingDistribution === dist.id}
                                  title={t("detail.distExecute")}
                                >
                                  {isExecutingDistribution === dist.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Play className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteDistribution(dist.id)}
                                  disabled={isDeletingDistribution === dist.id}
                                  title={t("detail.distDelete")}
                                >
                                  {isDeletingDistribution === dist.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </>
                            )}
                            {dist.status === "EXECUTED" && (
                              <Badge variant="outline" className="ml-2">
                                <Check className="mr-1 h-3 w-3" />
                                {t("detail.distDone")}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Verbundene Unternehmen Tab */}
        <TabsContent value="companies">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle>{t("detail.groupStructureTitle")}</CardTitle>
                  <InfoTooltip text={t("detail.groupStructureTooltip")} />
                </div>
                <CardDescription>
                  {t("detail.groupStructureDescription")}
                </CardDescription>
              </div>
              <Button onClick={() => setIsAddHierarchyDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t("detail.linkCompany")}
              </Button>
            </CardHeader>
            <CardContent>
              {fund.parentHierarchies.length === 0 && fund.childHierarchies.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  {t("detail.noLinkedCompanies")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("detail.colCompanyName")}</TableHead>
                      <TableHead>{t("detail.colLegalForm")}</TableHead>
                      <TableHead>{t("detail.colType")}</TableHead>
                      <TableHead className="text-right">{t("detail.colOwnership")}</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* parentHierarchies = THIS fund is the child → show the parentFund (the other fund) */}
                    {fund.parentHierarchies.map((h) => {
                      const linkedFund = h.parentFund;
                      return (
                        <TableRow key={h.id}>
                          <TableCell>
                            <Link
                              href={`/funds/${linkedFund?.id}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {linkedFund?.name}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {linkedFund?.legalForm || "-"}
                          </TableCell>
                          <TableCell>
                            {linkedFund?.fundCategory ? (
                              <Badge
                                variant="outline"
                                style={{ borderColor: linkedFund.fundCategory.color, color: linkedFund.fundCategory.color }}
                              >
                                {linkedFund.fundCategory.name}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {h.ownershipPercentage != null
                              ? `${Number(h.ownershipPercentage).toFixed(2)}%`
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openDeleteHierarchyDialog(h.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {/* childHierarchies = THIS fund is the parent → show the childFund (the other fund) */}
                    {fund.childHierarchies.map((h) => {
                      const linkedFund = h.childFund;
                      return (
                        <TableRow key={h.id}>
                          <TableCell>
                            <Link
                              href={`/funds/${linkedFund?.id}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {linkedFund?.name}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {linkedFund?.legalForm || "-"}
                          </TableCell>
                          <TableCell>
                            {linkedFund?.fundCategory ? (
                              <Badge
                                variant="outline"
                                style={{ borderColor: linkedFund.fundCategory.color, color: linkedFund.fundCategory.color }}
                              >
                                {linkedFund.fundCategory.name}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {h.ownershipPercentage != null
                              ? `${Number(h.ownershipPercentage).toFixed(2)}%`
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openDeleteHierarchyDialog(h.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Anlagen Tab */}
        <TabsContent value="turbines">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle>{t("detail.turbinesTitle")}</CardTitle>
                  <InfoTooltip text={t("detail.turbinesTooltip")} />
                </div>
                <CardDescription>
                  {t("detail.turbinesDescription")}
                </CardDescription>
              </div>
              <Button onClick={() => setIsAddTurbineDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t("detail.assignTurbine")}
              </Button>
            </CardHeader>
            <CardContent>
              {fund.operatedTurbines.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  {t("detail.noTurbines")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("detail.colDesignation")}</TableHead>
                      <TableHead>{t("detail.colPark")}</TableHead>
                      <TableHead>{t("detail.colManufacturer")}</TableHead>
                      <TableHead>{t("detail.colModel")}</TableHead>
                      <TableHead className="text-right">{t("detail.colPowerKw")}</TableHead>
                      <TableHead className="text-right">{t("detail.colTurbineOwnership")}</TableHead>
                      <TableHead>{t("detail.colTurbineStatus")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fund.operatedTurbines.map((op) => (
                      <TableRow key={op.id}>
                        <TableCell className="font-medium">
                          {op.turbine.designation}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/parks/${op.turbine.park.id}`}
                            className="text-primary hover:underline"
                          >
                            {op.turbine.park.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {op.turbine.manufacturer || "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {op.turbine.model || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {op.turbine.ratedPowerKw != null
                            ? Number(op.turbine.ratedPowerKw).toLocaleString("de-DE")
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {op.ownershipPercentage != null
                            ? `${Number(op.ownershipPercentage).toFixed(0)}%`
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={op.turbine.status === "OPERATING"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"}
                          >
                            {op.turbine.status === "OPERATING" ? t("detail.turbineOperating") : op.turbine.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle>{t("detail.documentsTitle")}</CardTitle>
                  <InfoTooltip text={t("detail.documentsTooltip")} />
                </div>
                <CardDescription>{t("detail.documentsDescription")}</CardDescription>
              </div>
              <Button asChild>
                <Link href={`/documents/upload?fundId=${id}`}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("detail.upload")}
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {fund.documents.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  {t("detail.noDocuments")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("detail.colDocTitle")}</TableHead>
                      <TableHead>{t("detail.colDocCategory")}</TableHead>
                      <TableHead>{t("detail.colDocFile")}</TableHead>
                      <TableHead>{t("detail.colDocUploaded")}</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fund.documents.map((doc) => (
                      <TableRow
                        key={doc.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => router.push(`/documents/${doc.id}`)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            router.push(`/documents/${doc.id}`);
                          }
                        }}
                      >
                        <TableCell className="font-medium">{doc.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{doc.category}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {doc.fileName}
                        </TableCell>
                        <TableCell>
                          {format(new Date(doc.createdAt), "dd.MM.yyyy", {
                            locale: de,
                          })}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={t("detail.preview")}
                            title={t("detail.preview")}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewDocument(doc);
                              setPreviewOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activities Tab */}
        {flags.crm && (
          <TabsContent value="activities">
            <Card>
              <CardContent className="pt-6">
                <ActivityTimeline entityType="fund" entityId={fund.id} />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Add Hierarchy Dialog */}
      <Dialog open={isAddHierarchyDialogOpen} onOpenChange={setIsAddHierarchyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("detail.linkCompanyDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("detail.linkCompanyDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("detail.labelCompany")}</Label>
              <Select value={selectedHierarchyFundId} onValueChange={setSelectedHierarchyFundId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("detail.selectCompanyPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {availableFunds.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      {t("detail.noAvailableCompanies")}
                    </SelectItem>
                  ) : (
                    availableFunds.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}{f.legalForm ? ` (${f.legalForm})` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                <Link href="/funds/new" target="_blank">
                  <Plus className="mr-1 h-3 w-3" />
                  {t("detail.createNewCompany")}
                </Link>
              </Button>
            </div>
            <div className="space-y-2">
              <Label>{t("detail.labelOwnershipPct")}</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="z.B. 100"
                value={hierarchyOwnership}
                onChange={(e) => setHierarchyOwnership(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("detail.labelValidFrom")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !hierarchyValidFrom && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {hierarchyValidFrom
                      ? format(hierarchyValidFrom, "dd.MM.yyyy", { locale: de })
                      : t("detail.selectDate")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={hierarchyValidFrom}
                    onSelect={(date) => date && setHierarchyValidFrom(date)}
                    locale={de}
                    captionLayout="dropdown"
                    startMonth={new Date(2000, 0)}
                    endMonth={new Date(2030, 11)}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddHierarchyDialogOpen(false);
                setSelectedHierarchyFundId("");
                setHierarchyOwnership("");
              }}
            >
              {t("detail.cancel")}
            </Button>
            <Button
              onClick={handleAddHierarchy}
              disabled={!selectedHierarchyFundId || isAddingHierarchy}
            >
              {isAddingHierarchy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("detail.link")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Turbine Operator Dialog */}
      <Dialog open={isAddTurbineDialogOpen} onOpenChange={setIsAddTurbineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("detail.assignTurbineDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("detail.assignTurbineDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("detail.labelPark")}</Label>
              <Select value={selectedParkForTurbine} onValueChange={(v) => { setSelectedParkForTurbine(v); setSelectedTurbineId(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder={t("detail.selectParkPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {availableParksForTurbine.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      {t("detail.noParksAvailable")}
                    </SelectItem>
                  ) : (
                    availableParksForTurbine.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("detail.labelTurbine")}</Label>
              <Select value={selectedTurbineId} onValueChange={setSelectedTurbineId} disabled={!selectedParkForTurbine}>
                <SelectTrigger>
                  <SelectValue placeholder={selectedParkForTurbine ? t("detail.selectTurbinePlaceholder") : t("detail.selectParkFirst")} />
                </SelectTrigger>
                <SelectContent>
                  {availableTurbines.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      {t("detail.noTurbinesAvailable")}
                    </SelectItem>
                  ) : (
                    availableTurbines.map((tb) => (
                      <SelectItem key={tb.id} value={tb.id}>
                        {tb.designation}{tb.manufacturer ? ` - ${tb.manufacturer}` : ""}{tb.model ? ` ${tb.model}` : ""}
                        {tb.ratedPowerKw ? ` (${tb.ratedPowerKw} kW)` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("detail.labelOwnershipPct")}</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="z.B. 100"
                value={turbineOwnership}
                onChange={(e) => setTurbineOwnership(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("detail.labelValidFrom")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !turbineValidFrom && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {turbineValidFrom
                      ? format(turbineValidFrom, "dd.MM.yyyy", { locale: de })
                      : t("detail.selectDate")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={turbineValidFrom}
                    onSelect={(date) => date && setTurbineValidFrom(date)}
                    locale={de}
                    captionLayout="dropdown"
                    startMonth={new Date(2000, 0)}
                    endMonth={new Date(2030, 11)}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddTurbineDialogOpen(false);
                setSelectedTurbineId("");
                setSelectedParkForTurbine("");
                setTurbineOwnership("100");
              }}
            >
              {t("detail.cancel")}
            </Button>
            <Button
              onClick={handleAddTurbineOperator}
              disabled={!selectedTurbineId || isAddingTurbine}
            >
              {isAddingTurbine && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("detail.assign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Distribution Dialog */}
      <Dialog open={isDistributionDialogOpen} onOpenChange={setIsDistributionDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("detail.newDistributionTitle")}</DialogTitle>
            <DialogDescription>
              {t("detail.newDistributionDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="distributionAmount">{t("detail.labelTotalAmount")}</Label>
                <Input
                  id="distributionAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="z.B. 300000"
                  value={distributionAmount}
                  onChange={(e) => setDistributionAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("detail.labelDistributionDate")}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !distributionDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {distributionDate
                        ? format(distributionDate, "dd.MM.yyyy", { locale: de })
                        : t("detail.selectDate")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={distributionDate}
                      onSelect={(date) => date && setDistributionDate(date)}
                      locale={de}
                      captionLayout="dropdown"
                      startMonth={new Date(2020, 0)}
                      endMonth={new Date(2030, 11)}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label htmlFor="distributionDescription">{t("detail.labelDescription")}</Label>
                <Input
                  id="distributionDescription"
                  placeholder={t("detail.descriptionPlaceholder")}
                  value={distributionDescription}
                  onChange={(e) => setDistributionDescription(e.target.value)}
                />
              </div>
            </div>

            {/* Preview */}
            {distributionAmount && parseFloat(distributionAmount) > 0 && (
              <div className="space-y-3">
                <Label>{t("detail.previewTitle")}</Label>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("detail.previewColShareholder")}</TableHead>
                        <TableHead className="text-right">{t("detail.previewColShare")}</TableHead>
                        <TableHead className="text-right">{t("detail.previewColAmount")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {calculateDistributionPreview(parseFloat(distributionAmount)).map(
                        (item) => (
                          <TableRow key={item.shareholder.id}>
                            <TableCell>{getPersonName(item.shareholder.person)}</TableCell>
                            <TableCell className="text-right">
                              {item.percentage.toFixed(2)}%
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(item.amount)}
                            </TableCell>
                          </TableRow>
                        )
                      )}
                      <TableRow className="bg-muted/50 font-medium">
                        <TableCell>{t("detail.previewTotal")}</TableCell>
                        <TableCell className="text-right">100%</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(parseFloat(distributionAmount))}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("detail.previewHint")}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDistributionDialogOpen(false);
                setDistributionAmount("");
                setDistributionDescription("");
                setDistributionDate(new Date());
              }}
            >
              {t("detail.cancel")}
            </Button>
            <Button
              onClick={handleCreateDistribution}
              disabled={
                isCreatingDistribution ||
                !distributionAmount ||
                parseFloat(distributionAmount) <= 0
              }
            >
              {isCreatingDistribution && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("detail.createDistribution")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Distribution Detail Dialog */}
      <Dialog open={isDistributionDetailOpen} onOpenChange={setIsDistributionDetailOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {t("detail.distDetailTitle", { number: selectedDistribution?.distributionNumber || "" })}
            </DialogTitle>
            <DialogDescription>
              {selectedDistribution?.description || t("detail.noDescription")}
            </DialogDescription>
          </DialogHeader>
          {selectedDistribution && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between rounded-lg bg-muted p-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t("detail.distTotalAmount")}</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(Number(selectedDistribution.totalAmount))}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">{t("detail.distStatus")}</p>
                  <Badge
                    variant="secondary"
                    className={distributionStatusColors[selectedDistribution.status]}
                  >
                    {distributionStatusLabels[selectedDistribution.status]}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">{t("detail.distDate")}</p>
                  <p className="font-medium">
                    {format(new Date(selectedDistribution.distributionDate), "dd.MM.yyyy", {
                      locale: de,
                    })}
                  </p>
                </div>
                {selectedDistribution.executedAt && (
                  <div>
                    <p className="text-muted-foreground">{t("detail.distExecutedAt")}</p>
                    <p className="font-medium">
                      {format(new Date(selectedDistribution.executedAt), "dd.MM.yyyy HH:mm", {
                        locale: de,
                      })}
                    </p>
                  </div>
                )}
              </div>

              {selectedDistribution.items && selectedDistribution.items.length > 0 && (
                <div className="space-y-2">
                  <Label>{t("detail.distShareholderAllocation")}</Label>
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("detail.previewColShareholder")}</TableHead>
                          <TableHead className="text-right">{t("detail.previewColShare")}</TableHead>
                          <TableHead className="text-right">{t("detail.previewColAmount")}</TableHead>
                          {selectedDistribution.status === "EXECUTED" && (
                            <TableHead>{t("detail.distColCreditNote")}</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedDistribution.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              {item.shareholder?.person
                                ? getPersonName(item.shareholder.person as Shareholder["person"])
                                : "-"}
                            </TableCell>
                            <TableCell className="text-right">
                              {Number(item.percentage).toFixed(2)}%
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(Number(item.amount))}
                            </TableCell>
                            {selectedDistribution.status === "EXECUTED" && (
                              <TableCell>
                                {item.invoice ? (
                                  <Link
                                    href={`/invoices/${item.invoice.id}`}
                                    className="text-primary hover:underline"
                                  >
                                    {item.invoice.invoiceNumber}
                                  </Link>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDistributionDetailOpen(false)}
            >
              {t("detail.close")}
            </Button>
            {selectedDistribution?.status === "DRAFT" && (
              <Button
                onClick={() => {
                  setIsDistributionDetailOpen(false);
                  handleExecuteDistribution(selectedDistribution.id);
                }}
              >
                <Play className="mr-2 h-4 w-4" />
                {t("detail.execute")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Preview Dialog */}
      <DocumentPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        document={previewDocument}
      />

      {/* Shareholder Dialogs */}
      <ShareholderDialogs
        fundId={id}
        fundName={fund.name}
        totalCapital={fund.totalCapital}
        existingShareholders={fund.shareholders}
        onSuccess={fetchFund}
        isAddOpen={isAddShareholderOpen}
        setIsAddOpen={setIsAddShareholderOpen}
        isEditOpen={isEditShareholderOpen}
        setIsEditOpen={setIsEditShareholderOpen}
        editingShareholder={selectedShareholder}
        isDetailOpen={isShareholderDetailOpen}
        setIsDetailOpen={setIsShareholderDetailOpen}
        viewingShareholder={selectedShareholder}
      />

      {/* Delete Shareholder Confirmation Dialog */}
      <AlertDialog open={isDeleteShareholderDialogOpen} onOpenChange={setIsDeleteShareholderDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("detail.deleteShTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("detail.deleteShDescription")}
              {shareholderToDelete && (
                <span className="mt-2 block font-medium text-foreground">
                  {getPersonName(shareholderToDelete.person)}
                </span>
              )}
              <span className="mt-2 block text-red-600">
                {t("detail.deleteShWarning")}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingShareholder}>{t("detail.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteShareholder}
              disabled={isDeletingShareholder}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeletingShareholder ? t("detail.deleteShDeleting") : t("detail.deleteShConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Hierarchy Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteHierarchyDialogOpen}
        onOpenChange={setDeleteHierarchyDialogOpen}
        onConfirm={handleConfirmDeleteHierarchy}
        title={t("detail.removeLinkTitle")}
        description={t("detail.removeLinkDescription")}
      />

      {/* Execute Distribution Confirmation Dialog */}
      <AlertDialog open={executeDistDialogOpen} onOpenChange={setExecuteDistDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("detail.executeDistTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("detail.executeDistDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("detail.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmExecuteDistribution();
              }}
            >
              {t("detail.execute")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Distribution Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDistDialogOpen}
        onOpenChange={setDeleteDistDialogOpen}
        onConfirm={handleConfirmDeleteDistribution}
        title={t("detail.deleteDistTitle")}
        description={t("detail.deleteDistDescription")}
      />

      {/* Portal Access Dialogs */}
      <CreatePortalAccessDialog
        open={isCreatePortalAccessOpen}
        onOpenChange={setIsCreatePortalAccessOpen}
        shareholder={portalAccessShareholder}
        onSuccess={(result) => {
          setPortalCredentials(result);
          setIsPasswordDisplayOpen(true);
        }}
        onRefresh={fetchFund}
      />
      <RemovePortalAccessDialog
        open={isRemovePortalAccessOpen}
        onOpenChange={setIsRemovePortalAccessOpen}
        shareholder={portalAccessShareholder}
        onRefresh={fetchFund}
      />
      <PasswordDisplayDialog
        open={isPasswordDisplayOpen}
        onOpenChange={setIsPasswordDisplayOpen}
        credentials={portalCredentials}
      />

      {/* Batch Action Bar for Shareholders */}
      <BatchActionBar
        selectedCount={selectedShareholderCount}
        onClearSelection={clearShareholderSelection}
        actions={[
          {
            label: t("detail.batchExport"),
            icon: <Download className="h-4 w-4" />,
            onClick: handleBatchExportShareholders,
            disabled: isBatchProcessing,
          },
          {
            label: t("detail.batchPortalAccess"),
            icon: isBatchProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />,
            onClick: handleBatchEnablePortalAccess,
            disabled: isBatchProcessing,
          },
        ]}
      />
    </div>
  );
}
