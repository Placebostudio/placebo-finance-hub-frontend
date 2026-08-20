"use client";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MONTHS = [
  { value: 1,  label: "January" },  { value: 2,  label: "February" },
  { value: 3,  label: "March" },    { value: 4,  label: "April" },
  { value: 5,  label: "May" },      { value: 6,  label: "June" },
  { value: 7,  label: "July" },     { value: 8,  label: "August" },
  { value: 9,  label: "September" },{ value: 10, label: "October" },
  { value: 11, label: "November" }, { value: 12, label: "December" },
];

function getYearOptions() {
  const y = new Date().getFullYear();
  return [y - 2, y - 1, y, y + 1];
}

function shiftMonth(month, year, delta) {
  let m = month + delta;
  let y = year;
  if (m < 1)  { m = 12; y -= 1; }
  if (m > 12) { m = 1;  y += 1; }
  return { month: m, year: y };
}

/**
 * Shared period selector used across Documents, Transactions, Reconciliation, and Reports.
 *
 * @param {number}   month    Currently selected month (1–12)
 * @param {number}   year     Currently selected year
 * @param {Function} onChange Called with (month, year) when either changes
 * @param {string}   [label]  Prefix label; defaults to "Reporting Period"
 */
export function PeriodSelector({ month, year, onChange, label = "Reporting Period" }) {
  const prev = () => { const n = shiftMonth(month, year, -1); onChange(n.month, n.year); };
  const next = () => { const n = shiftMonth(month, year,  1); onChange(n.month, n.year); };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-sm font-medium text-muted-foreground shrink-0">{label}:</span>
      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={prev}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Select value={String(month)} onValueChange={(v) => onChange(Number(v), year)}>
        <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
        <SelectContent>
          {MONTHS.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={String(year)} onValueChange={(v) => onChange(month, Number(v))}>
        <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
        <SelectContent>
          {getYearOptions().map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={next}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
