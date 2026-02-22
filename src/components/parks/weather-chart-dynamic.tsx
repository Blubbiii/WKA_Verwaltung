"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const WeatherChart = dynamic(
  () => import("@/components/parks/weather-chart").then((mod) => mod.WeatherChart),
  {
    ssr: false,
    loading: () => <Skeleton className="w-full h-96 rounded-lg" />,
  }
);

export { WeatherChart };
export default WeatherChart;
