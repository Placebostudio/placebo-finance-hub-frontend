const BASE_URL =`${process.env.NEXT_PUBLIC_API_URL}/api/currencies`;

export const currencyRepository = {

    // ============================================================
    // GET ALL CURRENCIES FROM DATABASE
    // ============================================================

    async getAll() {
        const response = await fetch(BASE_URL);

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Failed to get currencies"
            );
        }

        return data;
    },


    // ============================================================
    // GET ONE CURRENCY
    // ============================================================

    async getByCurrency(currency) {
        if (!currency) {
            throw new Error("Currency is required");
        }

        const response = await fetch(
            `${BASE_URL}/${encodeURIComponent(currency)}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Failed to get currency"
            );
        }

        return data;
    },


    // ============================================================
    // UPDATE / REFRESH CURRENCIES
    //
    // Retrieves current rates from Frankfurter and updates
    // the currency_rates table through the backend.
    // ============================================================

    async update() {
        const response = await fetch(
            `${BASE_URL}/update`,
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Failed to update currencies"
            );
        }

        return data;
    },


    // ============================================================
    // DELETE ONE CURRENCY
    // ============================================================

    async delete(currency) {
        if (!currency) {
            throw new Error("Currency is required");
        }

        const response = await fetch(
            `${BASE_URL}/${encodeURIComponent(currency)}`,
            {
                method: "DELETE",
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Failed to delete currency"
            );
        }

        return data;
    },


    // ============================================================
    // RETRIEVE CURRENCY DATA FROM FRANKFURTER
    //
    // Does NOT update the database.
    // Just retrieves the external API data.
    // ============================================================

    async retrieveData() {
        const response = await fetch(
            `${BASE_URL}/retrieve`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Failed to retrieve currency data"
            );
        }

        return data;
    },
};