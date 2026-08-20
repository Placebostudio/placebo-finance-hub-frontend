import { create } from "zustand";
import { persist } from "zustand/middleware";
import { userService } from "@/services/user.service";

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      login: (username, password) => {
        const user = userService.findByCredentials(username, password);
        if (user) {
          // Don't persist password in session
          const session = { id: user.id, username: user.username, fullName: user.fullName, role: user.role, email: user.email };
          set({ user: session, isAuthenticated: true });
          return true;
        }
        return false;
      },

      logout: () => {
        set({ user: null, isAuthenticated: false });
      },
    }),
    {
      name: "pfh_auth_session",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
