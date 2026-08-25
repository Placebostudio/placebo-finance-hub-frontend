const BASE_URL =
    `${process.env.NEXT_PUBLIC_API_URL}/api/document_extractions`;

export const documentExtractionRepository = {

    // ============================================================
    // GET ALL DOCUMENT EXTRACTIONS
    // ============================================================

    async getAll(filters = {}) {

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

        const queryString = params.toString();

        const url = queryString
            ? `${BASE_URL}?${queryString}`
            : BASE_URL;

        const response = await fetch(url);

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Failed to get document extractions"
            );
        }

        return data;
    },


    // ============================================================
    // GET EXTRACTION FOR DOCUMENT
    //
    // The database does not have an extraction ID.
    // document_id is the identifier.
    // ============================================================

    async getById(documentId) {

        const response = await fetch(
            `${BASE_URL}/${documentId}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Failed to get document extraction"
            );
        }

        return data;
    },


    // ============================================================
    // CREATE DOCUMENT EXTRACTION
    //
    // The file has ALREADY been uploaded.
    //
    // This only creates the document_extractions row.
    // ============================================================

    async create(data) {

        const response = await fetch(
            BASE_URL,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    document_id:
                        data.document_id,

                    method:
                        data.method,

                    fields:
                        data.fields ?? {},

                    validation_issues:
                        data.validation_issues ?? [],

                    full_text:
                        data.full_text ?? null,

                    confidence:
                        data.confidence ?? null,

                    duration_ms:
                        data.duration_ms ?? null,

                    is_current:
                        data.is_current ?? true,

                    spam:
                        data.spam ?? false
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Failed to create document extraction"
            );
        }

        return result.extraction ?? result;
    },


    // ============================================================
    // UPDATE DOCUMENT EXTRACTION
    //
    // id = document_id
    // because document_extractions has no separate id.
    // ============================================================

    async update(documentId, data) {

        const before =
            await this.getById(documentId);


        const response = await fetch(
            `${BASE_URL}/${documentId}`,
            {
                method: "PUT",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify(data)
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Failed to update document extraction"
            );
        }

        return {
            before,
            extraction:
                result.extraction ?? result
        };
    },


    // ============================================================
    // MARK EXTRACTION AS SPAM
    //
    // There is no deleted_at column.
    // spam is the appropriate field.
    // ============================================================

    async softDelete(documentId) {

        const before =
            await this.getById(documentId);


        const response = await fetch(
            `${BASE_URL}/${documentId}`,
            {
                method: "PUT",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    spam: true
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Failed to mark document extraction as spam"
            );
        }

        return {
            before,
            extraction:
                result.extraction ?? result
        };
    },


    // ============================================================
    // DELETE DOCUMENT EXTRACTION
    //
    // Permanent delete.
    // ============================================================

    async delete(documentId) {

        const before =
            await this.getById(documentId);


        const response = await fetch(
            `${BASE_URL}/${documentId}`,
            {
                method: "DELETE"
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Failed to delete document extraction"
            );
        }

        return {
            before,
            result
        };
    }
};