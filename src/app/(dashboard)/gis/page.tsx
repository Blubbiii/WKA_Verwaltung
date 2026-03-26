import { GISPageClient } from "./GISPageClient";

// Feature-flag visibility is handled by the sidebar (nav-config.ts featureFlag: "gis").
// The API route enforces plots:read permission for data access.
export default function GISPage() {
  return <GISPageClient />;
}
