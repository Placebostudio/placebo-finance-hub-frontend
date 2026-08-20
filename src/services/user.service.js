/**
 * Local user management.
 * IMPORTANT: This is frontend-only demo auth, NOT production security.
 * Users and passwords are stored in localStorage in plain text.
 * Replace with a real auth service before going live.
 */

import { lsGetArray, lsSetArray } from "@/storage/local-store";
import { generateId } from "@/lib/utils";
import { DEMO_USERS } from "@/config";

const STORE = "users";

export const userService = {
  getAll() {
    const stored = lsGetArray(STORE);
    if (stored.length > 0) return stored;
    // Seed demo users on first call
    lsSetArray(STORE, DEMO_USERS);
    return DEMO_USERS;
  },

  getById(id) {
    return this.getAll().find((u) => u.id === id) ?? null;
  },

  getActive() {
    return this.getAll().filter((u) => u.isActive);
  },

  findByCredentials(username, password) {
    return this.getAll().find(
      (u) => u.username === username && u.password === password && u.isActive
    ) ?? null;
  },

  create(data) {
    const user = {
      id: generateId(),
      username: data.username ?? "",
      password: data.password ?? "",
      email: data.email ?? "",
      fullName: data.fullName ?? "",
      role: data.role ?? "employee",
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    const all = this.getAll();
    all.push(user);
    lsSetArray(STORE, all);
    return user;
  },

  update(id, changes) {
    const all = this.getAll().map((u) => (u.id === id ? { ...u, ...changes } : u));
    lsSetArray(STORE, all);
    return all.find((u) => u.id === id) ?? null;
  },

  delete(id) {
    const all = this.getAll().filter((u) => u.id !== id);
    lsSetArray(STORE, all);
  },
};
