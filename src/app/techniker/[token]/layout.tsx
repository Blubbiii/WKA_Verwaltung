import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Techniker Check-In | WindparkManager",
  description: "QR-basiertes Check-In/Check-Out für Servicetechniker",
};

export default function TechnikerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
