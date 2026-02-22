import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] gap-3 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-9 w-[200px]" />
      </div>

      {/* Toolbar */}
      <Skeleton className="h-12 w-full rounded-lg" />

      {/* Canvas */}
      <Skeleton className="flex-1 w-full rounded-lg" />

      {/* Legend */}
      <Skeleton className="h-16 w-full rounded-lg" />
    </div>
  );
}
