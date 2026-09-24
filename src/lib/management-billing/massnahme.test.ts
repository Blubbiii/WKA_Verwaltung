/**
 * Das Formular für Optimierungs-Maßnahmen schickte `priority: "MEDIUM"`, die
 * API verlangt eine Zahl — jedes Anlegen und Speichern scheiterte mit 400.
 * Der Test schickt den Rumpf durch die echten Schemas der API.
 */

import { describe, expect, it } from "vitest";
import { massnahmeRumpf } from "./massnahme";
import { taskCreateSchema, taskUpdateSchema } from "./task-schemas";

const formular = {
  title: "Rotorblätter reinigen",
  description: "",
  category: "EFFICIENCY",
  priority: "2",
  dueDate: "2026-10-01",
  costEstimateEur: "1500,00".replace(",", "."),
  benefitNotes: "",
};

describe("Rumpf einer Optimierungs-Maßnahme", () => {
  it("besteht das Schema zum Anlegen", () => {
    const ergebnis = taskCreateSchema.safeParse(massnahmeRumpf({ ...formular, parkId: "" }));
    expect(ergebnis.error?.issues ?? []).toEqual([]);
    expect(ergebnis.data?.priority).toBe(2);
  });

  it("besteht das Schema zum Speichern", () => {
    const rumpf = massnahmeRumpf({ ...formular, priority: "1", status: "IN_PROGRESS", actualCostEur: "" });
    const ergebnis = taskUpdateSchema.safeParse(rumpf);
    expect(ergebnis.error?.issues ?? []).toEqual([]);
    expect(ergebnis.data?.priority).toBe(1);
    expect(ergebnis.data?.actualCostEur).toBeNull();
  });

  it("lehnt eine Priorität außerhalb der Skala ab", () => {
    expect(taskCreateSchema.safeParse({ title: "x", priority: 7 }).success).toBe(false);
  });
});
