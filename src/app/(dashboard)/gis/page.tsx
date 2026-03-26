import dynamic from "next/dynamic";

const GISClient = dynamic(
  () => import("@/components/gis/GISClient").then((m) => m.GISClient),
  { ssr: false }
);

export default function GISPage() {
  return (
    <div className="-mx-6 -my-6 overflow-hidden">
      <GISClient />
    </div>
  );
}
