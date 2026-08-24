const BASE_URL = `${"http://localhost:5173"}/api/users`;

const LOGGED_IN_USER_KEY = "logged_in_user";

export const userRepository = {

    // ============================================================
    // GET ALL USERS
    // GET /api/users
    // ============================================================

    async getAll() {
        const response = await fetch(BASE_URL);

        if (!response.ok) {
            throw new Error("Failed to get users");
        }

        return await response.json();
    },


    // ============================================================
    // GET ONE USER
    // GET /api/users/:userid
    // ============================================================

    async getById(id) {
        const response = await fetch(`${BASE_URL}/${id}`);

        if (response.status === 404) {
            return null;
        }

        if (!response.ok) {
            throw new Error("Failed to get user");
        }

        return await response.json();
    },


    // ============================================================
    // GET ACTIVE USERS
    //
    // Your backend doesn't currently have a separate route for this,
    // so get all users and filter on the frontend.
    // ============================================================

    async getActive() {
        const users = await this.getAll();

        return users.filter((user) => user.is_active);
    },


    // ============================================================
    // LOGIN
    // POST /api/users/login
    //
    // Assumes Supabase Auth already authenticated the user and this
    // endpoint receives the authenticated user's UUID.
    // ============================================================

    async login(username, password) {

        const response = await fetch(
            `${BASE_URL}/login`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    username,
                    password
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Login failed"
            );
        }


        // ========================================================
        // STORE LOGGED-IN USER
        // ========================================================

        localStorage.setItem(
            LOGGED_IN_USER_KEY,
            JSON.stringify(data.user)
        );


        return data;
    },


    // ============================================================
    // GET LOGGED-IN USER
    // ============================================================

    getLoggedInUser() {

        const storedUser =
            localStorage.getItem(LOGGED_IN_USER_KEY);

        if (!storedUser) {
            return null;
        }

        try {

            return JSON.parse(storedUser);

        } catch (err) {

            console.error(
                "Invalid logged-in user in localStorage",
                err
            );

            localStorage.removeItem(
                LOGGED_IN_USER_KEY
            );

            return null;
        }
    },


    // ============================================================
    // LOGOUT
    // ============================================================

    logout() {
        localStorage.removeItem(
            LOGGED_IN_USER_KEY
        );
    },


    // ============================================================
    // CREATE / INVITE USER
    // POST /api/users
    // ============================================================

    async create(data) {
        const response = await fetch(BASE_URL, {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                id: data.id,
                email: data.email,
                full_name: data.full_name ?? data.fullName,
                role: data.role ?? "viewer",
                invited_by: data.invited_by ?? null
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Failed to create user");
        }

        return result.user;
    },


    // ============================================================
    // UPDATE USER
    // PUT /api/users/:userid
    // ============================================================

    async update(id, changes) {
        const response = await fetch(`${BASE_URL}/${id}`, {
            method: "PUT",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                email: changes.email,
                full_name: changes.full_name ?? changes.fullName,
                role: changes.role,
                is_active:
                    changes.is_active !== undefined
                        ? changes.is_active
                        : changes.isActive
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Failed to update user");
        }

        return result.user;
    },


    // ============================================================
    // DEACTIVATE USER
    // DELETE /api/users/:userid
    //
    // requester_id is required by your backend.
    // ============================================================

    async delete(id, requester_id) {
        const response = await fetch(`${BASE_URL}/${id}`, {
            method: "DELETE",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                requester_id
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Failed to deactivate user");
        }

        return result;
    },


    // ============================================================
    // REACTIVATE USER
    //
    // This requires a route like:
    // PUT /api/users/:userid/reactivate
    // ============================================================

    async reactivate(id) {
        const response = await fetch(
            `${BASE_URL}/${id}/reactivate`,
            {
                method: "PUT"
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Failed to reactivate user");
        }

        return result.user;
    },


    // ============================================================
    // ACCEPT INVITATION
    //
    // This requires:
    // PUT /api/users/:userid/accept-invitation
    // ============================================================

    async acceptInvitation(id) {
        const response = await fetch(
            `${BASE_URL}/${id}/accept-invitation`,
            {
                method: "PUT"
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error || "Failed to accept invitation"
            );
        }

        return result.user;
    }
};