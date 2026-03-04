"use client";

// Re-export wrapper: individual dialog components are in ./turbine-dialogs/
import { AddTurbineDialog } from "./turbine-dialogs/AddTurbineDialog";
import { EditTurbineDialog } from "./turbine-dialogs/EditTurbineDialog";
import { TurbineDetailDialog } from "./turbine-dialogs/TurbineDetailDialog";
import type { Turbine, TurbineDialogsProps } from "./turbine-dialogs/types";

export type { Turbine, TurbineDialogsProps };

export function TurbineDialogs({
  parkId,
  parkName,
  onSuccess,
  isAddOpen,
  setIsAddOpen,
  isEditOpen,
  setIsEditOpen,
  editingTurbine,
  isDetailOpen,
  setIsDetailOpen,
  viewingTurbine,
}: TurbineDialogsProps) {
  return (
    <>
      <AddTurbineDialog
        parkId={parkId}
        parkName={parkName}
        isOpen={isAddOpen}
        setIsOpen={setIsAddOpen}
        onSuccess={onSuccess}
      />
      <EditTurbineDialog
        turbine={editingTurbine}
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        onSuccess={onSuccess}
      />
      <TurbineDetailDialog
        turbine={viewingTurbine}
        isOpen={isDetailOpen}
        setIsOpen={setIsDetailOpen}
        onEdit={() => {
          setIsDetailOpen(false);
          setIsEditOpen(true);
        }}
      />
    </>
  );
}
