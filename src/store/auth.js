import { create } from "zustand";
import { persist } from "zustand/middleware";
import { userService as backendUserService } from "@/services/backend-users";

// Map old persisted role names to the current role system
const ROLE_MIGRATION = { admin: "owner", finance: "manager", employee: "viewer" };

function migrateRole(role) {
  return ROLE_MIGRATION[role] ?? role;
}

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      login: async (username, password) => {
        // Throws on invalid credentials or network errors — caller handles the error
        const data = await backendUserService.login(username, password);
        const u = data.user;
        const session = {
          id: u.id,
          username: u.username,
          fullName: u.full_name,
          role: migrateRole(u.role),
          email: u.email,
        };
        set({ user: session, isAuthenticated: true });
      },

      logout: () => {
        backendUserService.logout();
        set({ user: null, isAuthenticated: false });
      },
    }),
    {
      name: "pfh_auth_session",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      // Migrate persisted session roles on rehydration
      onRehydrateStorage: () => (state) => {
        if (state?.user?.role && ROLE_MIGRATION[state.user.role]) {
          state.user = { ...state.user, role: migrateRole(state.user.role) };
        }
      },
    }
  )
);
