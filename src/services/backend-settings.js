const BASE_URL =
    `${process.env.NEXT_PUBLIC_API_URL}/api/app-settings`;

import { auditRepository } from "./backend-audits.js";
import { userRepository } from "./backend-users.js";


export const appSettingsRepository = {

    // ============================================================
    // GET SETTINGS
    // ============================================================

    async getSettings() {

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        if (!userId) {
            throw new Error(
                "No logged-in user found"
            );
        }


        const response = await fetch(
            `${BASE_URL}?user_id=${encodeURIComponent(userId)}`
        );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Failed to get app settings"
            );
        }


        return data;
    },


    // ============================================================
    // UPDATE SETTINGS
    // ============================================================

    async updateSettings(data) {

        // ========================================================
        // GET LOGGED-IN USER
        // ========================================================

        const currentUser =
            userRepository.getLoggedInUser();

        const userId =
            currentUser?.id;

        if (!userId) {
            throw new Error(
                "No logged-in user found"
            );
        }


        // ========================================================
        // GET OLD SETTINGS BEFORE CHANGING THEM
        // ========================================================

        const before =
            await this.getSettings();


        // ========================================================
        // UPDATE SETTINGS
        // ========================================================

        const response =
            await fetch(
                BASE_URL,
                {
                    method: "PUT",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        ...data,
                        user_id: userId
                    })
                }
            );


        const updatedSettings =
            await response.json();


        if (!response.ok) {

            throw new Error(
                updatedSettings.error ||
                "Failed to update app settings"
            );
        }


        // ========================================================
        // AUDIT LOG
        // ========================================================

        await auditRepository.create({

            actor_id:
                userId,

            action:
                "update",

            entity_type:
                "app_settings",

            entity_id:
                updatedSettings.id ?? null,

            before:
                before,

            after:
                updatedSettings,

            ip_address:
                null,

            user_agent:
                navigator.userAgent
        });


        return updatedSettings;
    }
};