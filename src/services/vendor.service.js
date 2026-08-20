/**
 * Vendor and category management.
 */

import { lsGetArray, lsSetArray, lsGetObject, lsSetObject } from "@/storage/local-store";
import { generateId } from "@/lib/utils";
import { APP_CONFIG } from "@/config";

const VENDORS_STORE = "vendors";
const CATEGORIES_STORE = "categories";

export const vendorService = {
  getAll() {
    return lsGetArray(VENDORS_STORE);
  },

  getById(id) {
    return this.getAll().find((v) => v.id === id) ?? null;
  },

  create(data) {
    const vendor = {
      id: generateId(),
      name: data.name ?? "",
      normalizedName: (data.name ?? "").toLowerCase().trim(),
      defaultCategory: data.defaultCategory ?? "",
      notes: data.notes ?? "",
      createdAt: new Date().toISOString(),
    };
    const all = this.getAll();
    all.push(vendor);
    lsSetArray(VENDORS_STORE, all);
    return vendor;
  },

  update(id, changes) {
    const all = this.getAll().map((v) =>
      v.id === id
        ? { ...v, ...changes, normalizedName: (changes.name ?? v.name).toLowerCase().trim() }
        : v
    );
    lsSetArray(VENDORS_STORE, all);
    return all.find((v) => v.id === id) ?? null;
  },

  delete(id) {
    const all = this.getAll().filter((v) => v.id !== id);
    lsSetArray(VENDORS_STORE, all);
  },
};

export const categoryService = {
  getAll() {
    const stored = lsGetArray(CATEGORIES_STORE);
    if (stored.length > 0) return stored;
    // Seed defaults on first call
    const defaults = APP_CONFIG.defaultCategories.map((name) => ({
      id: generateId(),
      name,
      isActive: true,
      createdAt: new Date().toISOString(),
    }));
    lsSetArray(CATEGORIES_STORE, defaults);
    return defaults;
  },

  getActive() {
    return this.getAll().filter((c) => c.isActive);
  },

  create(name) {
    const cat = {
      id: generateId(),
      name,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    const all = this.getAll();
    all.push(cat);
    lsSetArray(CATEGORIES_STORE, all);
    return cat;
  },

  update(id, changes) {
    const all = this.getAll().map((c) => (c.id === id ? { ...c, ...changes } : c));
    lsSetArray(CATEGORIES_STORE, all);
    return all.find((c) => c.id === id) ?? null;
  },

  delete(id) {
    const all = this.getAll().filter((c) => c.id !== id);
    lsSetArray(CATEGORIES_STORE, all);
  },
};
