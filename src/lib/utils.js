import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount, currency = "ILS", locale = "he-IL") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date, format = "short") {
  if (!date) return "—";

  let year;
  let month;
  let day;

  // Date-only string: YYYY-MM-DD
  // Treat it as a calendar date, NOT a timestamp.
  if (typeof date === "string") {
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (m) {
      year = Number(m[1]);
      month = Number(m[2]);
      day = Number(m[3]);
    } else {
      const d = new Date(date);

      if (isNaN(d.getTime())) return "—";

      year = d.getFullYear();
      month = d.getMonth() + 1;
      day = d.getDate();
    }
  } else {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return "—";
    }

    year = date.getFullYear();
    month = date.getMonth() + 1;
    day = date.getDate();
  }

  // Create a local Date only for display formatting.
  const d = new Date(year, month - 1, day);

  if (format === "short") {
    return d.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  if (format === "long") {
    return d.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  if (format === "iso") {
    // IMPORTANT: don't use toISOString().
    return [
      String(year).padStart(4, "0"),
      String(month).padStart(2, "0"),
      String(day).padStart(2, "0"),
    ].join("-");
  }

  return d.toLocaleDateString();
}

export function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function generateId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function getInitials(name = "") {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);
}

export function calculateVAT(netAmount, vatRate) {
  const vatAmount = netAmount * (vatRate / 100);
  const grossAmount = netAmount + vatAmount;
  return {
    vatAmount: Math.round(vatAmount * 100) / 100,
    grossAmount: Math.round(grossAmount * 100) / 100,
  };
}

/**
 * Calculate net amount and VAT amount from a gross (total-paid) amount.
 *
 * The gross amount already includes VAT, so we divide out the VAT factor:
 *   net      = gross / (1 + vatRate/100)
 *   vatAmount = gross - net
 *
 * Example at 18%:  100 gross → 84.75 net + 15.25 VAT
 * Example at 25%:  100 gross → 80.00 net + 20.00 VAT
 *
 * @param {number} grossAmount  Total paid (including VAT)
 * @param {number} vatRate      VAT percentage (e.g. 18 for 18%)
 * @returns {{ netAmount: number, vatAmount: number }}
 */
export function calculateFromGross(grossAmount, vatRate) {
  const rate = vatRate / 100;
  const netAmount = Math.round((grossAmount / (1 + rate)) * 100) / 100;
  const vatAmount = Math.round((grossAmount - netAmount) * 100) / 100;
  return { netAmount, vatAmount };
}

export function parseAmount(value) {
  if (typeof value === "number") return value;
  if (s.includes('%')) return null;
  const cleaned = String(value).replace(/[^0-9.,-]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

export function truncate(text, length) {
  if (!text || text.length <= length) return text;
  return `${text.substring(0, length)}...`;
}

export function normalizeVendorName(name = "") {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05FF\s]/g, "") // keep Hebrew too
    .replace(/\s+/g, " ")
    .trim();
}

/** Derive YYYY-MM period string from a date string. "2026-07-15" → "2026-07" */
export function dateToPeriod(dateStr) {
  if (!dateStr || typeof dateStr !== "string" || dateStr.length < 7) return null;
  return dateStr.substring(0, 7);
}

/** Format a YYYY-MM period string for display. "2026-07" → "July 2026" */
export function periodLabel(period) {
  if (!period || period.length < 7) return period ?? "";
  const [yearStr, monthStr] = period.split("-");
  const d = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
  if (isNaN(d.getTime())) return period;
  return d.toLocaleString("en-GB", { month: "long", year: "numeric" });
}

/** Build a YYYY-MM period string from year and month integers. (2026, 7) → "2026-07" */
export function buildPeriod(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}
