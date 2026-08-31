const BASE_URL =
    `${process.env.NEXT_PUBLIC_API_URL}/api/reports`;

import { userRepository } from "./backend-users.js";

export const expenseLedgerRepository = {

    // ============================================================
    // GET EXPENSE LEDGER
    // GET /api/reports/expense-ledger
    //
    // This page is NOT available to viewers.
    // ============================================================

    async getAll(filters = {}) {

        const currentUser =
            userRepository.getLoggedInUser();

        if (!currentUser) {
            throw new Error(
                "No logged-in user found"
            );
        }


        const params = new URLSearchParams();

        Object.entries(filters).forEach(([key, value]) => {

            if (
                value !== undefined &&
                value !== null &&
                value !== ""
            ) {
                params.append(key, value);
            }

        });


        // Include the logged-in user ID so the backend
        // can identify the requester.

        params.set(
            "user_id",
            currentUser.id
        );


        const queryString =
            params.toString();


        const url =
            queryString
                ? `${BASE_URL}/expense-ledger?${queryString}`
                : `${BASE_URL}/expense-ledger`;


        const response =
            await fetch(url);


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Failed to load expense ledger"
            );
        }


        return data;
    }
};