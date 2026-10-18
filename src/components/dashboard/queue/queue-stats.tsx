"use client";

import {
  Stack,
  ShieldWarning,
  CalendarCheck,
  WarningOctagon,
} from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

export type QueueFilterStatus = "all" | "awaiting_approval" | "scheduled" | "draft" | "posted" | "failed";

interface QueueStatsProps {
  totalCount: number;
  awaitingApprovalCount: number;
  scheduledCount: number;
  failedCount: number;
  activeFilter: QueueFilterStatus;
  onSelectFilter: (filter: QueueFilterStatus) => void;
}

export function QueueStats({
  totalCount,
  awaitingApprovalCount,
  scheduledCount,
  failedCount,
  activeFilter,
  onSelectFilter,
}: QueueStatsProps) {
  const cards = [
    {
      id: "all" as QueueFilterStatus,
      label: "Total Posts",
      sublabel: "Active queue items",
      value: totalCount,
      icon: Stack,
      tone: "default" as const,
      colorClasses: "text-foreground group-hover:text-primary",
      iconBg: "bg-surface-2 text-foreground group-hover:bg-primary/10 group-hover:text-primary",
      activeRing: "ring-2 ring-primary/40 border-primary/50 bg-surface",
    },
    {
      id: "awaiting_approval" as QueueFilterStatus,
      label: "Awaiting Approval",
      sublabel: "Needs human review",
      value: awaitingApprovalCount,
      icon: ShieldWarning,
      tone: "warning" as const,
      colorClasses: "text-amber-500",
      iconBg: "bg-amber-500/10 text-amber-500",
      activeRing: "ring-2 ring-amber-500/40 border-amber-500/50 bg-amber-500/5",
    },
    {
      id: "scheduled" as QueueFilterStatus,
      label: "Scheduled",
      sublabel: "Ready for auto-post",
      value: scheduledCount,
      icon: CalendarCheck,
      tone: "primary" as const,
      colorClasses: "text-primary",
      iconBg: "bg-primary/10 text-primary",
      activeRing: "ring-2 ring-primary/40 border-primary/50 bg-primary/5",
    },
    {
      id: "failed" as QueueFilterStatus,
      label: "Failed / Attention",
      sublabel: "Requires inspection",
      value: failedCount,
      icon: WarningOctagon,
      tone: "destructive" as const,
      colorClasses: "text-destructive",
      iconBg: "bg-destructive/10 text-destructive",
      activeRing: "ring-2 ring-destructive/40 border-destructive/50 bg-destructive/5",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const isActive = activeFilter === card.id;

        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelectFilter(isActive && card.id !== "all" ? "all" : card.id)}
            className={cn(
              "group relative flex flex-col justify-between rounded-2xl border border-border bg-surface p-4 text-left transition-all hover:border-border/80 hover:shadow-md cursor-pointer",
              isActive ? card.activeRing : "hover:bg-surface-2/60"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                {card.label}
              </span>
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
                  card.iconBg
                )}
              >
                <Icon size={18} weight="bold" />
              </div>
            </div>

            <div className="mt-3">
              <span className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {card.value}
              </span>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {card.sublabel}
              </p>
            </div>

            {isActive && (
              <span className="absolute bottom-1.5 right-3 h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
}
