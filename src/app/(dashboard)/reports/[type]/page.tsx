"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/format";
import { de } from "date-fns/locale";
import {
  ArrowLeft,
  Printer,
  Download,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

interface ReportData {
  title: string;
  generatedAt: string;
  tenant: {
    name: string;
    logoUrl: string | null;
    primaryColor: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
  };
  data: any;
}

export default function ReportViewPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReport();
  }, [params.type]);

  async function fetchReport() {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      const fundId = searchParams.get("fundId");
      const parkId = searchParams.get("parkId");
      if (fundId) queryParams.set("fundId", fundId);
      if (parkId) queryParams.set("parkId", parkId);

      const response = await fetch(
        `/api/reports/${params.type}?${queryParams}`
      );
      if (!response.ok) throw new Error("Fehler beim Laden");
      const data = await response.json();
      setReport(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  function formatNumber(value: number, decimals: number = 2): string {
    return new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/reports">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück
          </Link>
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Bericht konnte nicht geladen werden.
          </CardContent>
        </Card>
      </div>
    );
  }

  const { data, tenant, title, generatedAt } = report;

  return (
    <div className="space-y-6">
      {/* Header - hidden when printing */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/reports">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <p className="text-muted-foreground">
              Erstellt am{" "}
              {format(new Date(generatedAt), "dd.MM.yyyy 'um' HH:mm 'Uhr'", {
                locale: de,
              })}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Drucken
          </Button>
        </div>
      </div>

      {/* Report Content - Print optimized */}
      <div className="print:p-0" id="report-content">
        {/* Print Header */}
        <div className="hidden print:block mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{title}</h1>
              <p className="text-sm text-muted-foreground">
                {tenant.name} |{" "}
                {format(new Date(generatedAt), "dd.MM.yyyy HH:mm", {
                  locale: de,
                })}
              </p>
            </div>
            {tenant.logoUrl && (
              <Image src={tenant.logoUrl} alt={tenant.name} width={48} height={48} className="h-12 w-auto" unoptimized />
            )}
          </div>
          <Separator className="my-4" />
        </div>

        {/* Summary Card */}
        {data.summary && (
          <Card className="print:border-0 print:shadow-none">
            <CardHeader className="print:pb-2">
              <CardTitle>Zusammenfassung</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4 print:grid-cols-4">
                {Object.entries(data.summary).map(([key, value]) => {
                  if (typeof value === "object") return null;
                  let label = key;
                  let displayValue: string = String(value);

                  // Translate keys
                  const keyTranslations: Record<string, string> = {
                    totalParks: "Windparks",
                    totalTurbines: "Turbinen",
                    totalCapacityMw: "Gesamtleistung (MW)",
                    totalShareholders: "Gesellschafter",
                    totalOwnershipPercentage: "Beteiligung (%)",
                    totalContracts: "Verträge",
                    totalAnnualValue: "Jahreswert",
                    totalExpiring: "Auslaufend",
                    withinNotice: "Kündigungsfrist",
                    withinEnd: "Vertragsende",
                    totalInvoices: "Rechnungen",
                    totalAmount: "Gesamtbetrag",
                    totalVotes: "Abstimmungen",
                    totalFunds: "Gesellschaften",
                  };

                  label = keyTranslations[key] || key;

                  // Format values
                  if (
                    key.includes("Value") ||
                    key.includes("Amount") ||
                    key.includes("Paid") ||
                    key.includes("Outstanding")
                  ) {
                    displayValue = formatCurrency(Number(value));
                  } else if (key.includes("CapacityMw")) {
                    displayValue = formatNumber(Number(value)) + " MW";
                  } else if (key.includes("Percentage")) {
                    displayValue = formatNumber(Number(value)) + " %";
                  }

                  return (
                    <div key={key} className="text-center p-3 bg-muted/50 rounded-lg print:bg-gray-100">
                      <p className="text-2xl font-bold">{displayValue}</p>
                      <p className="text-sm text-muted-foreground">{label}</p>
                    </div>
                  );
                })}
              </div>

              {/* Status breakdown if available */}
              {data.summary.byStatus && (
                <div className="mt-4">
                  <p className="text-sm font-medium mb-2">Nach Status:</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(data.summary.byStatus).map(([status, count]) => (
                      <Badge key={status} variant="secondary">
                        {status}: {String(count)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Data Table */}
        <Card className="print:border-0 print:shadow-none print:mt-4">
          <CardHeader className="print:pb-2">
            <CardTitle>Detaildaten</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Render appropriate table based on data type */}
            {data.parks && <ParksTable data={data.parks} formatNumber={formatNumber} />}
            {data.turbines && <TurbinesTable data={data.turbines} />}
            {data.shareholders && <ShareholdersTable data={data.shareholders} formatNumber={formatNumber} />}
            {data.contracts && <ContractsTable data={data.contracts} formatCurrency={formatCurrency} />}
            {data.invoices && <InvoicesTable data={data.invoices} formatCurrency={formatCurrency} />}
            {data.votes && <VotesTable data={data.votes} />}
            {data.funds && <FundsTable data={data.funds} formatCurrency={formatCurrency} />}
          </CardContent>
        </Card>

        {/* Print Footer */}
        <div className="hidden print:block mt-8 pt-4 border-t text-xs text-muted-foreground">
          <p>
            {tenant.name}
            {tenant.address && ` | ${tenant.address}`}
            {tenant.phone && ` | Tel: ${tenant.phone}`}
            {tenant.email && ` | ${tenant.email}`}
          </p>
        </div>
      </div>
    </div>
  );
}

// Table Components
function ParksTable({ data, formatNumber }: { data: any[]; formatNumber: (v: number, d?: number) => string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Standort</TableHead>
          <TableHead className="text-right">Turbinen</TableHead>
          <TableHead className="text-right">Leistung (MW)</TableHead>
          <TableHead>Gesellschaft</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((park) => (
          <TableRow key={park.id}>
            <TableCell className="font-medium">{park.shortName || park.name}</TableCell>
            <TableCell>{park.location || "-"}</TableCell>
            <TableCell className="text-right">
              {park.operationalTurbines}/{park.turbineCount}
            </TableCell>
            <TableCell className="text-right">{formatNumber(park.totalCapacityMw)}</TableCell>
            <TableCell>{park.funds || "-"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TurbinesTable({ data }: { data: any[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Bezeichnung</TableHead>
          <TableHead>Windpark</TableHead>
          <TableHead>Hersteller/Modell</TableHead>
          <TableHead className="text-right">Leistung (kW)</TableHead>
          <TableHead>Inbetriebnahme</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((turbine) => (
          <TableRow key={turbine.id}>
            <TableCell className="font-medium">{turbine.designation}</TableCell>
            <TableCell>{turbine.park}</TableCell>
            <TableCell>
              {turbine.manufacturer} {turbine.model}
            </TableCell>
            <TableCell className="text-right">{turbine.ratedPowerKw || "-"}</TableCell>
            <TableCell>{turbine.commissioningDate || "-"}</TableCell>
            <TableCell>
              <Badge variant={turbine.status === "OPERATIONAL" ? "default" : "secondary"}>
                {turbine.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ShareholdersTable({ data, formatNumber }: { data: any[]; formatNumber: (v: number, d?: number) => string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Gesellschaft</TableHead>
          <TableHead>Typ</TableHead>
          <TableHead className="text-right">Beteiligung (%)</TableHead>
          <TableHead className="text-right">Stimmrechte (%)</TableHead>
          <TableHead>Eintritt</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((sh) => (
          <TableRow key={sh.id}>
            <TableCell className="font-medium">{sh.name}</TableCell>
            <TableCell>{sh.fund}</TableCell>
            <TableCell>{sh.type}</TableCell>
            <TableCell className="text-right">{formatNumber(sh.ownershipPercentage)}</TableCell>
            <TableCell className="text-right">{formatNumber(sh.votingRightsPercentage)}</TableCell>
            <TableCell>{sh.entryDate || "-"}</TableCell>
            <TableCell>
              <Badge variant={sh.status === "ACTIVE" ? "default" : "secondary"}>
                {sh.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ContractsTable({ data, formatCurrency }: { data: any[]; formatCurrency: (v: number) => string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Titel</TableHead>
          <TableHead>Typ</TableHead>
          <TableHead>Park/Partner</TableHead>
          <TableHead>Laufzeit</TableHead>
          <TableHead className="text-right">Jahreswert</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((contract) => (
          <TableRow key={contract.id}>
            <TableCell className="font-medium">
              {contract.title}
              {contract.contractNumber && (
                <span className="text-muted-foreground ml-2">({contract.contractNumber})</span>
              )}
            </TableCell>
            <TableCell>
              <Badge variant="outline">{contract.contractType}</Badge>
            </TableCell>
            <TableCell>
              {contract.park || contract.partner || "-"}
            </TableCell>
            <TableCell>
              {contract.startDate}
              {contract.endDate && ` - ${contract.endDate}`}
            </TableCell>
            <TableCell className="text-right">
              {contract.annualValue ? formatCurrency(contract.annualValue) : "-"}
            </TableCell>
            <TableCell>
              <Badge
                variant={
                  contract.status === "ACTIVE"
                    ? "default"
                    : contract.status === "EXPIRING"
                    ? "destructive"
                    : "secondary"
                }
              >
                {contract.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function InvoicesTable({ data, formatCurrency }: { data: any[]; formatCurrency: (v: number) => string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rechnungsnummer</TableHead>
          <TableHead>Gesellschaft</TableHead>
          <TableHead>Empfänger</TableHead>
          <TableHead>Datum</TableHead>
          <TableHead className="text-right">Brutto</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((invoice) => (
          <TableRow key={invoice.id}>
            <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
            <TableCell>{invoice.fund || "-"}</TableCell>
            <TableCell>{invoice.recipient || "-"}</TableCell>
            <TableCell>{invoice.invoiceDate}</TableCell>
            <TableCell className="text-right">{formatCurrency(invoice.totalGross)}</TableCell>
            <TableCell>
              <Badge
                variant={
                  invoice.status === "PAID"
                    ? "default"
                    : invoice.status === "OVERDUE"
                    ? "destructive"
                    : "secondary"
                }
              >
                {invoice.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function VotesTable({ data }: { data: any[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Titel</TableHead>
          <TableHead>Gesellschaft</TableHead>
          <TableHead>Enddatum</TableHead>
          <TableHead className="text-right">Teilnahme</TableHead>
          <TableHead>Ergebnis</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((vote) => (
          <TableRow key={vote.id}>
            <TableCell className="font-medium">{vote.title}</TableCell>
            <TableCell>{vote.fund || "-"}</TableCell>
            <TableCell>{vote.endDate}</TableCell>
            <TableCell className="text-right">{vote.totalResponses}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {Object.entries(vote.results || {}).map(([option, result]: [string, any]) => (
                  <Badge key={option} variant="outline" className="text-xs">
                    {option}: {result.percentage?.toFixed(1)}%
                  </Badge>
                ))}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function FundsTable({ data, formatCurrency }: { data: any[]; formatCurrency: (v: number) => string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Typ</TableHead>
          <TableHead className="text-right">Gesellschafter</TableHead>
          <TableHead className="text-right">Parks</TableHead>
          <TableHead className="text-right">Fakturiert</TableHead>
          <TableHead className="text-right">Offen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((fund) => (
          <TableRow key={fund.id}>
            <TableCell className="font-medium">{fund.name}</TableCell>
            <TableCell>
              <Badge variant="outline">{fund.fundType}</Badge>
            </TableCell>
            <TableCell className="text-right">{fund.shareholderCount}</TableCell>
            <TableCell className="text-right">{fund.parkCount}</TableCell>
            <TableCell className="text-right">{formatCurrency(fund.totalInvoiced)}</TableCell>
            <TableCell className="text-right">
              <span className={fund.outstandingAmount > 0 ? "text-red-600 font-medium" : ""}>
                {formatCurrency(fund.outstandingAmount)}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
