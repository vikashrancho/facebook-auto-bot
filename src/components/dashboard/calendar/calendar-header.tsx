"use client";

import { useState, useRef, useEffect } from "react";
import {
  CaretLeft,
  CaretRight,
  CaretDown,
  CaretUp,
  Plus,
  ArrowsClockwise,
  FadersHorizontal,
  Check,
  Rocket,
} from "@phosphor-icons/react/dist/ssr";

import type { CalendarView } from "@/lib/types";

interface CalendarHeaderProps {
  currentDate: Date;
  view: CalendarView;
  timezone: string;
  isRefreshing?: boolean;
  showFilters: boolean;
  onToggleFilters: () => void;
  onViewChange: (view: CalendarView) => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  onNavigateToday: () => void;
  onDateSelect: (date: Date) => void;
  onOpenScheduleModal: () => void;
  onRefresh: () => void;
  onProcessDuePosts?: () => void;
  dueCount?: number;
}


const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarHeader({
  currentDate,
  view,
  timezone,
  isRefreshing = false,
  showFilters,
  onToggleFilters,
  onViewChange,
  onNavigatePrev,
  onNavigateNext,
  onNavigateToday,
  onDateSelect,
  onOpenScheduleModal,
  onRefresh,
  onProcessDuePosts,
  dueCount = 0,
}: CalendarHeaderProps) {

  // State for Meta-style date picker popover
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isViewDropdownOpen, setIsViewDropdownOpen] = useState(false);

  // Temporary picker navigation state
  const [pickerYear, setPickerYear] = useState<number>(currentDate.getFullYear());
  const [pickerMonth, setPickerMonth] = useState<number>(currentDate.getMonth());
  const [selectedDay, setSelectedDay] = useState<number>(currentDate.getDate());

  const datePickerRef = useRef<HTMLDivElement>(null);
  const viewDropdownRef = useRef<HTMLDivElement>(null);

  // Sync picker state when currentDate changes
  useEffect(() => {
    setPickerYear(currentDate.getFullYear());
    setPickerMonth(currentDate.getMonth());
    setSelectedDay(currentDate.getDate());
  }, [currentDate]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        datePickerRef.current &&
        !datePickerRef.current.contains(event.target as Node)
      ) {
        setIsDatePickerOpen(false);
      }
      if (
        viewDropdownRef.current &&
        !viewDropdownRef.current.contains(event.target as Node)
      ) {
        setIsViewDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Format header title based on current view
  const headerDateRangeText = (() => {
    if (view === "month") {
      return currentDate.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
    }
    if (view === "day") {
      return currentDate.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    if (view === "week") {
      const d = new Date(currentDate);
      const day = d.getDay();
      const start = new Date(d.getTime() - day * 86400000);
      const end = new Date(start.getTime() + 6 * 86400000);

      const startMonth = start.toLocaleDateString("en-US", { month: "short" });
      const endMonth = end.toLocaleDateString("en-US", { month: "short" });
      const startDay = start.getDate();
      const endDay = end.getDate();
      const endYear = end.getFullYear();

      if (startMonth === endMonth) {
        return `${startMonth} ${startDay} - ${endDay}, ${endYear}`;
      }
      return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${endYear}`;
    }
    return "Upcoming Schedule";
  })();

  const timezoneDisplayLabel = (() => {
    if (timezone.includes("Kolkata") || timezone.includes("Calcutta")) {
      return "India Standard Time (Asia/Kolkata)";
    }
    return timezone;
  })();

  // Mini Calendar grid calculation for popover
  const calendarCells = (() => {
    const firstDayOfMonth = new Date(pickerYear, pickerMonth, 1).getDay();
    const daysInCurrentMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(pickerYear, pickerMonth, 0).getDate();

    const cells: {
      day: number;
      isCurrentMonth: boolean;
      isPrevMonth?: boolean;
      isNextMonth?: boolean;
      year: number;
      month: number;
    }[] = [];

    // Trailing days from previous month
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      const prevMonth = pickerMonth === 0 ? 11 : pickerMonth - 1;
      const prevYear = pickerMonth === 0 ? pickerYear - 1 : pickerYear;
      cells.push({
        day: daysInPrevMonth - i,
        isCurrentMonth: false,
        isPrevMonth: true,
        year: prevYear,
        month: prevMonth,
      });
    }

    // Days of current month
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      cells.push({
        day: d,
        isCurrentMonth: true,
        year: pickerYear,
        month: pickerMonth,
      });
    }

    // Leading days of next month to fill grid
    const totalSlots = cells.length > 35 ? 42 : 35;
    const remaining = totalSlots - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const nextMonth = pickerMonth === 11 ? 0 : pickerMonth + 1;
      const nextYear = pickerMonth === 11 ? pickerYear + 1 : pickerYear;
      cells.push({
        day: d,
        isCurrentMonth: false,
        isNextMonth: true,
        year: nextYear,
        month: nextMonth,
      });
    }

    return cells;
  })();

  function handlePrevMonth() {
    if (pickerMonth === 0) {
      setPickerMonth(11);
      setPickerYear((y) => y - 1);
    } else {
      setPickerMonth((m) => m - 1);
    }
  }

  function handleNextMonth() {
    if (pickerMonth === 11) {
      setPickerMonth(0);
      setPickerYear((y) => y + 1);
    } else {
      setPickerMonth((m) => m + 1);
    }
  }

  function handleApplyDate() {
    const newDate = new Date(pickerYear, pickerMonth, selectedDay);
    onDateSelect(newDate);
    setIsDatePickerOpen(false);
  }

  const yearOptions = [
    pickerYear - 2,
    pickerYear - 1,
    pickerYear,
    pickerYear + 1,
    pickerYear + 2,
  ];

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 text-foreground shadow-sm sm:p-5">
      {/* Top Main Row: Meta Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Date Range with Popover Dropdown & Timezone Subtitle */}
        <div className="relative" ref={datePickerRef}>
          <button
            type="button"
            onClick={() => setIsDatePickerOpen((prev) => !prev)}
            className="group flex items-center gap-2 text-left cursor-pointer transition hover:opacity-90"
            title="Choose dates"
          >
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {headerDateRangeText}
            </h1>
            <span className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground group-hover:text-foreground group-hover:bg-surface-2">
              {isDatePickerOpen ? (
                <CaretUp size={16} weight="bold" />
              ) : (
                <CaretDown size={16} weight="bold" />
              )}
            </span>
          </button>
          <div className="mt-0.5 text-xs font-normal text-muted-foreground">
            {timezoneDisplayLabel}
          </div>

          {/* Meta-Style Date Picker Popover Modal */}
          {isDatePickerOpen && (
            <div className="absolute left-0 top-full z-50 mt-3 w-80 rounded-2xl border border-border bg-surface p-4.5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-foreground">
              {/* Popover Month Navigation Header */}
              <div className="flex items-center justify-between pb-3">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground cursor-pointer"
                  title="Previous month"
                >
                  <CaretLeft size={16} weight="bold" />
                </button>
                <div className="text-sm font-semibold text-foreground">
                  {MONTH_NAMES[pickerMonth]} {pickerYear}
                </div>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground cursor-pointer"
                  title="Next month"
                >
                  <CaretRight size={16} weight="bold" />
                </button>
              </div>

              {/* Day of Week Labels */}
              <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground pb-2">
                {WEEKDAY_NAMES.map((name) => (
                  <div key={name} className="py-1">
                    {name}
                  </div>
                ))}
              </div>

              {/* Days Grid */}
              <div className="grid grid-cols-7 gap-y-1 text-center text-sm font-medium">
                {calendarCells.map((cell, idx) => {
                  const isSelected =
                    cell.isCurrentMonth &&
                    cell.day === selectedDay &&
                    cell.month === pickerMonth &&
                    cell.year === pickerYear;

                  return (
                    <div key={idx} className="flex items-center justify-center py-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (cell.isPrevMonth) {
                            handlePrevMonth();
                          } else if (cell.isNextMonth) {
                            handleNextMonth();
                          }
                          setSelectedDay(cell.day);
                          setPickerMonth(cell.month);
                          setPickerYear(cell.year);
                        }}
                        className={`flex h-8 w-8 items-center justify-center rounded-full transition cursor-pointer text-xs ${
                          isSelected
                            ? "bg-primary font-bold text-primary-foreground shadow-sm hover:opacity-90"
                            : cell.isCurrentMonth
                            ? "text-foreground hover:bg-surface-2"
                            : "text-muted-foreground/50 hover:bg-surface-2"
                        }`}
                      >
                        {cell.day}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Year & Month Dropdown Selectors */}
              <div className="mt-4 grid grid-cols-2 gap-2.5 pt-3 border-t border-border">
                {/* Year Select */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Year
                  </label>
                  <div className="relative">
                    <select
                      value={pickerYear}
                      onChange={(e) => setPickerYear(Number(e.target.value))}
                      className="w-full appearance-none rounded-xl border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground outline-none transition focus:border-primary cursor-pointer"
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y} className="bg-surface text-foreground">
                          {y}
                        </option>
                      ))}
                    </select>
                    <CaretDown
                      size={12}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                  </div>
                </div>

                {/* Month Select */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Month
                  </label>
                  <div className="relative">
                    <select
                      value={pickerMonth}
                      onChange={(e) => setPickerMonth(Number(e.target.value))}
                      className="w-full appearance-none rounded-xl border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground outline-none transition focus:border-primary cursor-pointer"
                    >
                      {MONTH_NAMES.map((m, idx) => (
                        <option key={m} value={idx} className="bg-surface text-foreground">
                          {m}
                        </option>
                      ))}
                    </select>
                    <CaretDown
                      size={12}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                  </div>
                </div>
              </div>

              {/* Advanced scheduling note & Apply button */}
              <div className="mt-4 flex items-center justify-between gap-2 pt-2">
                <span className="text-[11px] leading-tight text-muted-foreground">
                  Posts can be scheduled up to 29 days in advance.
                </span>
                <button
                  type="button"
                  onClick={handleApplyDate}
                  className="rounded-lg bg-surface-2 px-4 py-1.5 text-xs font-semibold text-foreground transition hover:bg-primary hover:text-primary-foreground active:scale-95 cursor-pointer border border-border"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Controls: Navigation Pill, View Dropdown, Filter Toggle, Schedule Action */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Process Due Posts Button */}
          {dueCount > 0 && onProcessDuePosts && (
            <button
              type="button"
              onClick={onProcessDuePosts}
              disabled={isRefreshing}
              title="Process and publish due scheduled posts to Facebook"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition cursor-pointer"
            >
              <Rocket size={15} weight="bold" />
              <span>Publish {dueCount} Due Post{dueCount > 1 ? "s" : ""}</span>
            </button>
          )}

          {/* Refresh Button */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh calendar data"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted-foreground transition hover:bg-surface hover:text-foreground disabled:opacity-50 cursor-pointer"
          >
            <ArrowsClockwise
              size={15}
              className={isRefreshing ? "animate-spin text-primary" : ""}
            />
          </button>


          {/* Prev / Today / Next Navigation Group */}
          <div className="flex items-center rounded-xl border border-border bg-surface-2 p-0.5">
            <button
              type="button"
              onClick={onNavigatePrev}
              title="Previous period"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-surface hover:text-foreground cursor-pointer"
            >
              <CaretLeft size={16} weight="bold" />
            </button>
            <button
              type="button"
              onClick={onNavigateToday}
              className="px-3 py-1 text-xs font-semibold text-foreground transition hover:bg-surface rounded-md cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={onNavigateNext}
              title="Next period"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-surface hover:text-foreground cursor-pointer"
            >
              <CaretRight size={16} weight="bold" />
            </button>
          </div>

          {/* View Selector Dropdown */}
          <div className="relative" ref={viewDropdownRef}>
            <button
              type="button"
              onClick={() => setIsViewDropdownOpen((prev) => !prev)}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3.5 text-xs font-semibold text-foreground transition hover:bg-surface cursor-pointer"
            >
              <span className="capitalize">{view}</span>
              <CaretDown size={13} weight="bold" className="text-muted-foreground" />
            </button>

            {isViewDropdownOpen && (
              <div className="absolute right-0 top-full z-50 mt-1.5 w-36 rounded-xl border border-border bg-surface py-1 shadow-xl animate-in fade-in duration-100">
                {(["month", "week", "day", "agenda"] as CalendarView[]).map((v) => {
                  const active = view === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        onViewChange(v);
                        setIsViewDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-3.5 py-2 text-xs font-medium capitalize transition cursor-pointer ${
                        active
                          ? "bg-primary/15 text-primary font-semibold"
                          : "text-foreground hover:bg-surface-2"
                      }`}
                    >
                      <span>{v}</span>
                      {active && <Check size={14} weight="bold" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Filters Toggle Button */}
          <button
            type="button"
            onClick={onToggleFilters}
            title="Toggle filters"
            className={`flex h-9 w-9 items-center justify-center rounded-xl border transition cursor-pointer ${
              showFilters
                ? "border-primary bg-primary/20 text-primary"
                : "border-border bg-surface-2 text-muted-foreground hover:bg-surface hover:text-foreground"
            }`}
          >
            <FadersHorizontal size={16} weight="bold" />
          </button>

          {/* Primary Schedule Post Button */}
          <button
            type="button"
            onClick={onOpenScheduleModal}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 active:scale-95 cursor-pointer"
          >
            <Plus size={15} weight="bold" />
            <span className="hidden sm:inline">Schedule Post</span>
          </button>
        </div>
      </div>
    </div>
  );
}
