"use client";

import {
  CalendarCheck,
  Clock,
  ShieldCheck,
  CheckCircle,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";

export interface CalendarSummaryMetrics {
  scheduledToday: number;
  scheduledThisWeek: number;
  awaitingApproval: number;
  published: number;
  failedOrAttention: number;
}

interface CalendarSummaryProps {
  metrics: CalendarSummaryMetrics;
  activeFilter?: string;
  onSelectFilter?: (filter: string) => void;
}

export function CalendarSummary({
  metrics,
  activeFilter,
  onSelectFilter,
}: CalendarSummaryProps) {
  const cards = [
    {
      id: "scheduled_today",
      label: "Scheduled Today",
      count: metrics.scheduledToday,
      icon: CalendarCheck,
      color: "text-blue-500 bg-blue-500/15 border-blue-500/20",
      activeBg: "border-blue-500 ring-2 ring-blue-500/20 bg-blue-500/5",
    },
    {
      id: "scheduled_week",
      label: "Scheduled This Week",
      count: metrics.scheduledThisWeek,
      icon: Clock,
      color: "text-indigo-400 bg-indigo-500/15 border-indigo-500/20",
      activeBg: "border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-500/5",
    },
    {
      id: "awaiting_approval",
      label: "Awaiting Approval",
      count: metrics.awaitingApproval,
      icon: ShieldCheck,
      color: "text-amber-500 bg-amber-500/15 border-amber-500/20",
      activeBg: "border-amber-500 ring-2 ring-amber-500/20 bg-amber-500/5",
    },
    {
      id: "published",
      label: "Published",
      count: metrics.published,
      icon: CheckCircle,
      color: "text-emerald-500 bg-emerald-500/15 border-emerald-500/20",
      activeBg: "border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-500/5",
    },
    {
      id: "failed_or_attention",
      label: "Needs Attention",
      count: metrics.failedOrAttention,
      icon: WarningCircle,
      color: "text-rose-500 bg-rose-500/15 border-rose-500/20",
      activeBg: "border-rose-500 ring-2 ring-rose-500/20 bg-rose-500/5",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => {
        const Icon = c.icon;
        const isActive = activeFilter === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelectFilter?.(isActive ? "all" : c.id)}
            className={`flex flex-col justify-between rounded-2xl border p-4 sm:p-5 text-left transition cursor-pointer shadow-xs ${
              isActive
                ? c.activeBg
                : "border-border/80 bg-surface hover:border-border hover:bg-surface-2/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground truncate pr-2">
                {c.label}
              </span>
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border ${c.color}`}
              >
                <Icon size={16} weight="bold" />
              </span>
            </div>
            <div className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              {c.count}
            </div>
          </button>
        );
      })}
    </div>
  );
}
