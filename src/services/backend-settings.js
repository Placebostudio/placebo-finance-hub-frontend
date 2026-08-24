const BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/app-settings`;

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";


export const appSettingsRepository = {

    // ============================================================
    // GET SETTINGS
    // ============================================================

    async getSettings() {

        const response = await fetch(
            BASE_URL
        );

        const data = await response.json();

        if (!response.ok) {

            throw new Error(
                data.error || "Failed to get app settings"
            );
        }

        return data;
    },


    // ============================================================
    // UPDATE SETTINGS
    // ============================================================

    async updateSettings(data) {

        // Get the old settings BEFORE changing them
        const before = await this.getSettings();


        const response = await fetch(
            BASE_URL,
            {
                method: "PUT",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify(data)
            }
        );

        const updatedSettings = await response.json();

        if (!response.ok) {

            throw new Error(
                updatedSettings.error ||
                "Failed to update app settings"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        const currentUser =
            userRepository.getLoggedInUser();

        if (currentUser) {

            await auditRepository.create({

                actor_id: currentUser.id,

                action: "update",

                entity_type: "app_settings",

                entity_id: updatedSettings.id ?? null,

                before: before,

                after: updatedSettings,

                ip_address: null,

                user_agent: navigator.userAgent
            });
        }


        return updatedSettings;
    }
};