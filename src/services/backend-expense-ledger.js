const BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/reports`;

export const expenseLedgerRepository = {

    // ============================================================
    // GET EXPENSE LEDGER
    // GET /api/reports/expense-ledger
    //
    // Filters (all optional):
    //   period         — "YYYY-MM"
    //   payment_method — "credit_card" | "bank_transfer" | "cash"
    //   receipt_status — "attached" | "missing"
    //   coverage_state — "fully_matched" | "partially_matched" | "unmatched"
    //   search         — searches vendor_name, document_number, txn description
    // ============================================================

    async getAll(filters = {}) {

        const params = new URLSearchParams();

        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== "") {
                params.append(key, value);
            }
        });

        const queryString = params.toString();

        const url = queryString
            ? `${BASE_URL}/expense-ledger?${queryString}`
            : `${BASE_URL}/expense-ledger`;

        const response = await fetch(url);

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to load expense ledger");
        }

        return data;
    }
};
