import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Shared accounting period store.
 * All finance workflow pages (Documents, Transactions, Reconciliation, Reports)
 * read and write this single store so the selected period stays in sync.
 *
 * Persisted to localStorage under key "pfh_selected_period".
 */
export const usePeriodStore = create(
  persist(
    (set) => ({
      month: new Date().getMonth() + 1,
      year:  new Date().getFullYear(),
      /** Change both month and year at once. */
      setPeriod: (month, year) => set({ month, year }),
    }),
    { name: "pfh_selected_period" }
  )
);
