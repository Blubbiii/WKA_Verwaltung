/**
 * Request schemas of the operational-task API, shared by the routes and by
 * tests that check what the forms send. Route files may only export handlers.
 */

import { z } from "zod";

// Concrete shape for a single checklist entry attached to a task.
// UI (management-billing/tasks/[id]/page.tsx + tasks/new/page.tsx) rendert
// genau diese Felder — no free-form JSON, kein passthrough.
export const taskChecklistItemSchema = z.object({
  label: z.string().min(1).max(500),
  required: z.boolean().optional(),
  checked: z.boolean().optional(),
});

/** 1 = Hoch, 2 = Normal, 3 = Niedrig — see lib/management-billing/prioritaet.ts */
const prioritaet = z.number().int().min(1).max(3);

export const taskCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().nullish(),
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]).optional().default("OPEN"),
  priority: prioritaet.optional().default(2),
  taskType: z.string().optional().default("OPERATIONAL"),
  category: z.string().nullish(),
  dueDate: z.string().nullish(),
  notes: z.string().nullish(),
  checklistData: z.array(taskChecklistItemSchema).nullish(),
  parkId: z.string().nullish(),
  turbineId: z.string().nullish(),
  checklistId: z.string().nullish(),
  assignedToId: z.string().nullish(),
  costEstimateEur: z.number().nullish(),
  actualCostEur: z.number().nullish(),
  benefitNotes: z.string().nullish(),
});

export const taskUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullish(),
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
  priority: prioritaet.optional(),
  taskType: z.string().optional(),
  category: z.string().nullish(),
  dueDate: z.string().nullish(),
  notes: z.string().nullish(),
  checklistData: z.array(taskChecklistItemSchema).nullish(),
  parkId: z.string().nullish(),
  turbineId: z.string().nullish(),
  checklistId: z.string().nullish(),
  assignedToId: z.string().nullish(),
  costEstimateEur: z.number().nullish(),
  actualCostEur: z.number().nullish(),
  benefitNotes: z.string().nullish(),
});
