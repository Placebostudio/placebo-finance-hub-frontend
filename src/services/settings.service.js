/**
 * Application settings — persisted in localStorage.
 */

import { lsGetObject, lsSetObject } from "@/storage/local-store";

const STORE = "settings";

const DEFAULTS = {
  companyName: "My Company",
  defaultCurrency: "ILS",
  fiscalYearStart: 1,
  vatNumber: "",
  taxNumber: "",
  address: "",
};

export const settingsService = {
  get() {
    return { ...DEFAULTS, ...lsGetObject(STORE) };
  },

  update(changes) {
    const current = this.get();
    const updated = { ...current, ...changes };
    lsSetObject(STORE, updated);
    return updated;
  },
};
