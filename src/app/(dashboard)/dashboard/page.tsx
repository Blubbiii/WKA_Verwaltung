import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Wind, Zap, Users, FileWarning, TrendingUp, Calendar } from "lucide-react";

const stats = [
  {
    title: "Windparks",
    value: "12",
    description: "+2 dieses Jahr",
    icon: Wind,
    trend: "+16.7%",
  },
  {
    title: "Gesamtleistung",
    value: "156 MW",
    description: "45 Anlagen",
    icon: Zap,
    trend: "+8.3%",
  },
  {
    title: "Gesellschafter",
    value: "234",
    description: "8 Fonds",
    icon: Users,
    trend: "+12.5%",
  },
  {
    title: "Offene Verträge",
    value: "3",
    description: "Laufen in 30 Tagen aus",
    icon: FileWarning,
    trend: "Aktion erforderlich",
    alert: true,
  },
];

const upcomingDeadlines = [
  {
    title: "Pachtvertrag Flurstück 12/3",
    date: "24.02.2026",
    type: "Kündigung",
    daysLeft: 30,
  },
  {
    title: "Wartungsvertrag Vestas",
    date: "15.03.2026",
    type: "Verlängerung",
    daysLeft: 49,
  },
  {
    title: "Versicherung Windpark Nord",
    date: "01.04.2026",
    type: "Erneuerung",
    daysLeft: 66,
  },
];

const recentActivities = [
  {
    action: "Neue Abstimmung erstellt",
    detail: "Jahresabschluss 2025 - Fonds Alpha",
    time: "vor 2 Stunden",
  },
  {
    action: "Dokument hochgeladen",
    detail: "Monatsbericht Januar 2026",
    time: "vor 5 Stunden",
  },
  {
    action: "Gutschrift erstellt",
    detail: "Ausschüttung Q4/2025 - 15 Gesellschafter",
    time: "gestern",
  },
  {
    action: "Vertrag aktualisiert",
    detail: "Wartungsvertrag Enercon - Verlängert bis 2028",
    time: "vor 2 Tagen",
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Willkommen zurück! Hier ist Ihre Übersicht.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
              <div
                className={`mt-2 flex items-center text-xs ${
                  stat.alert
                    ? "text-destructive"
                    : "text-green-600 dark:text-green-400"
                }`}
              >
                {!stat.alert && <TrendingUp className="mr-1 h-3 w-3" />}
                {stat.trend}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Upcoming Deadlines */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Anstehende Fristen
            </CardTitle>
            <CardDescription>
              Verträge die Aufmerksamkeit erfordern
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {upcomingDeadlines.map((deadline, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium">{deadline.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {deadline.type} am {deadline.date}
                    </p>
                  </div>
                  <div
                    className={`text-sm font-medium px-2 py-1 rounded ${
                      deadline.daysLeft <= 30
                        ? "bg-destructive/10 text-destructive"
                        : deadline.daysLeft <= 60
                        ? "bg-yellow-500/10 text-yellow-600"
                        : "bg-green-500/10 text-green-600"
                    }`}
                  >
                    {deadline.daysLeft} Tage
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Letzte Aktivitäten</CardTitle>
            <CardDescription>
              Was zuletzt im System passiert ist
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivities.map((activity, i) => (
                <div
                  key={i}
                  className="flex items-start gap-4 border-b pb-4 last:border-0 last:pb-0"
                >
                  <div className="h-2 w-2 mt-2 rounded-full bg-primary" />
                  <div className="flex-1">
                    <p className="font-medium">{activity.action}</p>
                    <p className="text-sm text-muted-foreground">
                      {activity.detail}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {activity.time}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Schnellzugriff</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <button className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-accent transition-colors">
              <Wind className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">Neuer Windpark</span>
            </button>
            <button className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-accent transition-colors">
              <Users className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">Neuer Gesellschafter</span>
            </button>
            <button className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-accent transition-colors">
              <FileWarning className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">Neuer Vertrag</span>
            </button>
            <button className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-accent transition-colors">
              <Zap className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">Neue Abrechnung</span>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
