/**
 * Step validation of the "new lease" wizard, with the reason a step is blocked.
 * The reason keys map to leases.new.blocked.* in the message files.
 */

export type SchrittGrund =
  | "lessorMissing"
  | "lessorNameMissing"
  | "companyNameMissing"
  | "plotMissing"
  | "plotIncomplete"
  | "startDateMissing";

export interface SchrittStand {
  lessorMode: "select" | "create";
  selectedLessorId: string;
  newLessor: { personType: "natural" | "legal"; firstName: string; lastName: string; companyName: string };
  selectedPlotCount: number;
  newPlotCount: number;
  /** The "new plot" form that has not been added to the list yet. */
  entwurfFlurstueck: { cadastralDistrict: string; plotNumber: string; areaSqm: string; municipality: string };
  startDate: string | Date | null | undefined;
}

export type SchrittErgebnis =
  | { weiter: true; uebernimmEntwurf?: true }
  | { weiter: false; grund: SchrittGrund };

export function pruefeSchritt(schritt: number, s: SchrittStand): SchrittErgebnis {
  switch (schritt) {
    case 0:
      if (s.lessorMode === "select") {
        return s.selectedLessorId ? { weiter: true } : { weiter: false, grund: "lessorMissing" };
      }
      if (s.newLessor.personType === "natural") {
        return s.newLessor.firstName && s.newLessor.lastName
          ? { weiter: true }
          : { weiter: false, grund: "lessorNameMissing" };
      }
      return s.newLessor.companyName ? { weiter: true } : { weiter: false, grund: "companyNameMissing" };

    case 1: {
      const e = s.entwurfFlurstueck;
      const entwurfVollstaendig = !!e.cadastralDistrict && !!e.plotNumber;
      const entwurfAngefangen = !!(e.cadastralDistrict || e.plotNumber || e.areaSqm || e.municipality);
      // A half-filled draft would be silently lost on "Weiter" — say so instead.
      if (entwurfAngefangen && !entwurfVollstaendig) return { weiter: false, grund: "plotIncomplete" };
      if (entwurfVollstaendig) return { weiter: true, uebernimmEntwurf: true };
      return s.selectedPlotCount + s.newPlotCount > 0 ? { weiter: true } : { weiter: false, grund: "plotMissing" };
    }

    case 2:
      return s.startDate ? { weiter: true } : { weiter: false, grund: "startDateMissing" };

    default:
      return { weiter: true };
  }
}
