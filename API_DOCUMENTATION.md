# API Documentation (Skill Matrix Backend)

Base URL: `http://localhost:5001`

Auth:
- Most endpoints require JWT via header: `Authorization: Bearer <token>`
- JWT is issued by `POST /api/auth/login`

---

## 1) Health / Root
- `GET /api/` → **API is running** (no auth)

---

## 2) Authentication & Registration

### Auth
- `POST /api/auth/login`
  - Body: `{ "email": string, "password": string, "role": "admin"|"manager"|"employee"|"user" }`
  - Response: `{ token: string, user: { id, name, email, role, employeeId } }`
  - Creates JWT. **No CRUD** (login only)


- `POST /api/auth/validate`
  - Requires: `Authorization: Bearer <token>`
  - Validates token. **No CRUD**

- `PATCH /api/auth/change-password`
  - Requires: `Authorization: Bearer <token>`
  - Body: `{ currentPassword, newPassword }`
  - **Update** (password)

- `POST /api/auth/reset-password-direct`
  - Requires: `Authorization: Bearer <token>`
  - Admin resets a user’s password directly.
  - Body: `{ "userId": string, "newPassword": string }`
  - Response: typically `{ success: true }`.
  - **Update** (password)


- `POST /api/auth/password-requests`
  - Public endpoint
  - Body: `{ email, role, newPassword }`
  - Creates a pending request in `pending_password_requests`.
  - **Create** (request)

### Registration approvals (admin)
- `POST /api/auth/register`
  - Public endpoint
  - Body is defined by `registration.controller.js` (not expanded here).
  - **Create** (registration request)

- `GET /api/auth/registrations?status=pending|approved|rejected`
  - Requires: admin JWT
  - **Read** (list)

- `GET /api/auth/registrations/stats`
  - Requires: admin JWT
  - **Read** (counts)

- `POST /api/auth/registrations/:requestId/approve`
  - Requires: admin JWT
  - **Update** (approve + create real account)

- `POST /api/auth/registrations/:requestId/reject`
  - Requires: admin JWT
  - **Update** (reject)

---

## 3) Users (self-service + manager/admin actions)

### Employee self-service
All are available under `/api/users/*` and require JWT.

- `GET /api/users/profile`
  - **Read** (own profile + computed skills)

- `PUT /api/users/profile`
  - **Update** (own profile fields)

- `GET /api/users/machines`
  - **Read** (own machine assignments)

- `GET /api/users/shift`
  - **Read** (own active shift)

### Manager/Admin employee-scoped skills
Under `/api/users/manager/*` and require `MANAGER` or `ADMIN`.

- `GET /api/users/manager/employees/:employeeId/skills`
  - **Read**

- `POST /api/users/manager/employee-skills`
  - **Create** (assign skill)

- `PUT /api/users/manager/employee-skills/:id`
  - **Update** (skill level/notes)

- `DELETE /api/users/manager/employee-skills/:id`
  - **Delete** (soft delete via `is_deleted=1`)

### Manager/Admin employee-scoped machines
- `GET /api/users/manager/employees/:employeeId/machines`
  - **Read**

- `POST /api/users/manager/machine-assignments`
  - **Create** (assign machine)

- `PUT /api/users/manager/machine-assignments/:id`
  - **Update** (assignment active/date)

- `DELETE /api/users/manager/machine-assignments/:id`
  - **Delete** (deactivate)

### Manager/Admin employee-scoped shifts
- `GET /api/users/manager/employees/:employeeId/shift/active`
  - **Read** (active shift)

- `GET /api/users/manager/employees/:employeeId/shifts`
  - **Read** (history)

- `POST /api/users/manager/employee-shifts`
  - **Create**

- `PUT /api/users/manager/employee-shifts/:id`
  - **Update**

- `DELETE /api/users/manager/employee-shifts/:id`
  - **Delete** (deactivate)

### Admin-only user management
All under `/api/admin/*` and require admin JWT.

- `GET /api/admin/users/current`
  - **Read** (active users)

- `GET /api/admin/users/:id`
  - **Read** (single)

- `POST /api/admin/users`
  - **Create**

- `PUT /api/admin/users/:id`
  - **Update**

- `DELETE /api/admin/users/:id`
  - **Delete** (soft delete)

- `GET /api/admin/users`
  - **Read** (all users with stats)

- `PATCH /api/admin/users/:id/set-password`
  - **Update** (password)

- `DELETE /api/admin/users/:id/perm`
  - **Delete** (hard delete; use caution)

---

## 4) Employees
Under `/api/employees` (requires JWT)

- `GET /api/employees`
  - **Read** (list)

**No direct CRUD** endpoints for employees table in this router (only list).

---

## 5) Departments
Under `/api/departments` (requires JWT)

- `GET /api/departments/metrics`
  - **Read** (metrics)

- `GET /api/departments`
  - **Read**

- `GET /api/departments/:id`
  - **Read**

- `POST /api/departments`
  - **Create**

- `PUT /api/departments/:id`
  - **Update**

- `DELETE /api/departments/:id`
  - **Delete**

---

## 6) Skills
Under `/api/skills` (requires JWT)

- `GET /api/skills`
  - **Read**

- `GET /api/skills/:id`
  - **Read**

- `POST /api/skills`
  - **Create**

- `PUT /api/skills/:id`
  - **Update**

- `DELETE /api/skills/:id`
  - **Delete**

---

## 7) Employee Skills (generic routes)
Under `/api/employee-skills` (requires JWT)

- `GET /api/employee-skills`
  - **Read** (all)

- `GET /api/employee-skills/:employeeId`
  - **Read** (skills for employeeId)

- `POST /api/employee-skills`
  - **Create**

- `PUT /api/employee-skills/:id`
  - **Update**

- `DELETE /api/employee-skills/:id`
  - **Delete**

> Note: manager-scoped employee skill routes are also available via `/api/users/manager/*`.

---

## 8) Machines
Under `/api/machines` (requires JWT)

- `GET /api/machines`
  - **Read**

- `GET /api/machines/:id`
  - **Read**

- `POST /api/machines`
  - **Create**

- `PUT /api/machines/:id`
  - **Update**

- `DELETE /api/machines/:id`
  - **Delete**

> Assignments are primarily handled via `/api/users/manager/*` and `/api/users/machines` for self.

---

## 9) Work History
Under `/api/work-history` (requires JWT)

- `GET /api/work-history`
  - **Read** (supports query params used in controller)

- `GET /api/work-history/employee/:employeeId`
  - **Read**

- `GET /api/work-history/:id`
  - **Read**

- `POST /api/work-history`
  - **Create**

- `PUT /api/work-history/:id`
  - **Update**

- `DELETE /api/work-history/:id`
  - **Delete**

---

## 10) Skill Matrices
Under `/api/skill-matrix` (requires JWT)

- `GET /api/skill-matrix`
  - **Read**

- `GET /api/skill-matrix/employee/:employeeId`
  - **Read** (employee matrix)

- `GET /api/skill-matrix/department/:departmentId`
  - **Read**

- `GET /api/skill-matrix/:id`
  - **Read**

- `POST /api/skill-matrix`
  - **Create**

- `PUT /api/skill-matrix/:id`
  - **Update**

- `DELETE /api/skill-matrix/:id`
  - **Delete**

Alias (frontend compatibility):
- `/api/skills-mapping/*` → mounted to same router as `/api/skill-matrix`.

---

## 11) Export Logs
Under `/api/export-logs` (requires JWT)

- `GET /api/export-logs`
  - **Read**

- `GET /api/export-logs/:id`
  - **Read**

- `POST /api/export-logs`
  - **Create**

- `PATCH /api/export-logs/:id/status`
  - **Update** (status)

- `DELETE /api/export-logs/:id`
  - **Delete**

---

## 12) Dashboard
Under `/api/dashboard` (requires JWT)

- `GET /api/dashboard/stats`
  - **Read**

- `GET /api/dashboard/department-performance`
  - **Read**

- `GET /api/dashboard/machine-scores`
  - **Read**

- `GET /api/dashboard/health`
  - **Read**

---

## 13) Admin Audit Log (admin)
Under `/api/admin/audit-log` (requires admin JWT)
- `GET /api/admin/audit-log`
  - **Read** (paginated)

---

# Linking Backend -> Frontend

Your Next.js frontend uses URLs like:
- `http://localhost:5001/api/...`

So frontend service base URL should be:
- `http://localhost:5001`

Authentication flow:
1. Frontend calls `POST /api/auth/login`.
2. Frontend stores `token` in `localStorage`.
3. Frontend sends `Authorization: Bearer <token>` for protected endpoints.

---

# Suggested CRUD Matrix (quick view)

| Resource | CRUD Supported? |
|---|---|
| auth login/validate | No (auth only) |
| registrations | Create + approve/reject (workflow) |
| users (admin) | Yes (CRUD + soft delete) |
| users (employee self) | Read + Update (profile), Read (machines/shift) |
| employee skills | Yes (CRUD) |
| skills | Yes (CRUD) |
| departments | Yes (CRUD) |
| machines | Yes (CRUD) |
| work history | Yes (CRUD) |
| skill matrix | Yes (CRUD) |
| export logs | Create/Read/Update/Delete |
| dashboard | Read only |

