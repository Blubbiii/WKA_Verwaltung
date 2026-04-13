"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Briefcase, Calculator, Wrench, LayoutTemplate } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DASHBOARD_TEMPLATES,
  type DashboardTemplate,
} from "@/lib/dashboard/dashboard-templates";

const ICON_MAP: Record<string, React.ElementType> = {
  Briefcase,
  Calculator,
  Wrench,
};

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (template: DashboardTemplate) => void;
}

export function TemplatePicker({
  open,
  onOpenChange,
  onApply,
}: TemplatePickerProps) {
  const t = useTranslations("dashboard.templatePicker");
  const [confirmTemplate, setConfirmTemplate] =
    useState<DashboardTemplate | null>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5" />
              {t("title")}
            </DialogTitle>
            <DialogDescription>
              {t("description")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-3 mt-2">
            {DASHBOARD_TEMPLATES.map((template) => {
              const Icon = ICON_MAP[template.icon] || LayoutTemplate;
              return (
                <Card
                  key={template.id}
                  className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
                  onClick={() => setConfirmTemplate(template)}
                >
                  <CardHeader className="pb-2">
                    <div className="rounded-full bg-primary/10 p-2 w-fit mb-2">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-base">{template.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {template.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">
                      {t("widgetCount", { count: template.widgets.length })}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmTemplate}
        onOpenChange={(o) => {
          if (!o) setConfirmTemplate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmDescription", { name: confirmTemplate?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmTemplate) {
                  onApply(confirmTemplate);
                  setConfirmTemplate(null);
                  onOpenChange(false);
                }
              }}
            >
              {t("apply")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
