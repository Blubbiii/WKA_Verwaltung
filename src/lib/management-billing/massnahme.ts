/**
 * Optimization measures are operational tasks with taskType IMPROVEMENT.
 * This builds the request body from the form state for create and update.
 */

export interface MassnahmeFormular {
  title: string;
  description: string;
  category: string;
  /** Select value, i.e. the priority number as string ("1" | "2" | "3") */
  priority: string;
  dueDate: string;
  costEstimateEur: string;
  actualCostEur?: string;
  benefitNotes: string;
  parkId?: string;
  status?: string;
}

const zahlOderNull = (wert: string | undefined) => (wert ? parseFloat(wert) : null);

export function massnahmeRumpf(formular: MassnahmeFormular) {
  return {
    title: formular.title,
    description: formular.description || null,
    category: formular.category || null,
    priority: parseInt(formular.priority, 10),
    dueDate: formular.dueDate || null,
    costEstimateEur: zahlOderNull(formular.costEstimateEur),
    benefitNotes: formular.benefitNotes || null,
    taskType: "IMPROVEMENT",
    ...(formular.parkId !== undefined && { parkId: formular.parkId || null }),
    ...(formular.status !== undefined && { status: formular.status }),
    ...(formular.actualCostEur !== undefined && { actualCostEur: zahlOderNull(formular.actualCostEur) }),
  };
}
