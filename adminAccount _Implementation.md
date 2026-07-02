# Admin Account Management via Frontend

## Background

Currently, the admin account can only be created by manually inserting a row into SQL Server. There is no way to create, view, or delete an admin account through the frontend. This plan adds full admin-account lifecycle management accessible from the existing Admin Dashboard.

## Key Design Constraints

> [!IMPORTANT]
> **Singleton enforcement**: The SQL `UX_single_admin` filtered unique index already guarantees only ONE admin row can exist in `dawlance_user`. The new "Create Admin" endpoint must handle the unique-constraint error gracefully.

> [!WARNING]
> **Who can call these endpoints?** Only an already-authenticated admin can manage the admin account. This creates a chicken-and-egg bootstrap problem for the very **first** admin. The first admin still needs to be seeded via SQL (as today). After that, the current admin can rotate (delete + create) the admin account through the UI.

> [!CAUTION]
> **Deleting the admin account**: If the current admin deletes the admin account while logged in, their JWT will still be valid until it expires (24h). The backend must prevent an admin from deleting **their own** account through this endpoint (same protection as `deleteUserByAdmin`).

---

## Proposed Changes

### Backend

---

#### [MODIFY] [admin.controller.js](file:///Users/muzafaribrahim/ALL%20SEMESTERS/The%20Aftermath/GET%20Dawlance/Projects/Skill%20Matrix/skill%20matrix/backend/src/controllers/admin.controller.js)

Add 3 new controller functions:
- **`getAdminAccount`** — `GET /api/admin/account` — returns the single admin user row (or 404 if none).
- **`createAdminAccount`** — `POST /api/admin/account` — inserts a new admin row; returns 409 if one already exists.
- **`deleteAdminAccount`** — `DELETE /api/admin/account/:id` — soft-deletes the admin row, with guard: cannot delete self.

---

#### [MODIFY] [admin.routes.js](file:///Users/muzafaribrahim/ALL%20SEMESTERS/The%20Aftermath/GET%20Dawlance/Projects/Skill%20Matrix/skill%20matrix/backend/src/routes/admin.routes.js)

Add 3 new route definitions under the `requireAdmin` middleware:

```
GET    /api/admin/account          → getAdminAccount
POST   /api/admin/account          → createAdminAccount
DELETE /api/admin/account/:id      → deleteAdminAccount
```

---

### Frontend

---

#### [MODIFY] [app/admin/page.tsx](file:///Users/muzafaribrahim/ALL%20SEMESTERS/The%20Aftermath/GET%20Dawlance/Projects/Skill%20Matrix/skill%20matrix/skills-matrix-front-final-main/app/admin/page.tsx)

Add a new **"Admin Account"** tab (4th tab) to the existing tab bar that shows:

1. **Current Admin panel** — displays the current admin (name, email, employeeId) fetched from `GET /api/admin/account`, or a "No admin configured" state if 404.
2. **Create Admin form** (shown only when no admin exists or after deletion) — fields: Name, Email, Employee ID (optional), Password. Submits to `POST /api/admin/account`.
3. **Delete Admin button** — shown alongside the current admin info. Opens a confirmation modal, then calls `DELETE /api/admin/account/:id`. Blocked if the logged-in user is the same as the admin being deleted.

---

## Verification Plan

### Manual Verification
1. Start backend (`npm run dev`) and frontend (`npm run dev`).
2. Log in as the existing admin.
3. Navigate to Admin Dashboard → "Admin Account" tab.
4. Confirm current admin info is displayed.
5. Delete the admin account — confirm the row is soft-deleted and a "No admin configured" state is shown.
6. Create a new admin — fill the form, submit, confirm success toast and new admin displayed.
7. Try to create a second admin — confirm 409 error toast.
8. Try to delete self — confirm the backend blocks it.
