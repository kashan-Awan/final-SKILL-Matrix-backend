# Windows Setup Instructions (Skill Matrix Backend)

This document explains how to run the **Skill Matrix backend** on **Windows** (Node.js + SQL Server).

> Assumption: Backend is a Node/Express app using **SQL Server**.

---

## 1) Prerequisites

### Install Node.js
1. Download and install **Node.js LTS** from: https://nodejs.org/
2. After installation, verify:
   ```bat
   node -v
   npm -v
   ```

### Install Microsoft SQL Server
1. Install **SQL Server** (Developer edition is fine).
2. During setup, choose an authentication mode that allows your user to login.
3. Start SQL Server.

### Create the database (Skill Matrix)
- You must have the database/schema created that your backend expects.
- If your project includes a migration/seed script, run it (see your existing scripts folder).

---

## 2) Configure environment (DB connection)

### Find the DB config
- Typically the connection is set in:
  - `src/config/db.js`
  - or via environment variables (e.g., `.env`).

### If the backend uses environment variables
1. Copy/create a `.env` file in the backend root.
2. Set values like:
   - `DB_HOST`
   - `DB_USER`
   - `DB_PASSWORD`
   - `DB_NAME`
   - `DB_PORT`

### If the backend uses hardcoded values
- Update `src/config/db.js` to match your Windows SQL Server host/credentials.

---

## 3) Install dependencies
From the backend directory:

```bat
cd "PATH_TO_BACKEND_FOLDER"
```

Then run:

```bat
npm install
```

---

## 4) Run the backend
### Development mode
If the project uses `nodemon`:

```bat
npm run dev
```

### Production mode
```bat
npm start
```

### Verify server is running
Check the terminal output for something like “server running”.

---

## 5) Run database-dependent checks (optional)
If you have helper scripts in the backend root (example):

```bat
node test.js
```

(Use whatever scripts exist in your repo: `db-diagnostics.js`, `check-schema.js`, etc.)

---

## 6) Common Windows issues

### A) SQL Server connection failures
- Ensure SQL Server is running.
- Confirm port:
  - Default is often `1433`.
  - If you changed it, update `DB_PORT`.
- Verify whether you should use `localhost` or the SQL server name.

### B) Authentication problems
- If using SQL authentication, ensure the login exists and has permissions.
- If using Windows auth, the backend driver must support it and config must be correct.

### C) Firewall
- Windows firewall may block port `1433`.
- Allow inbound TCP `1433` (or your configured port).

---

## 7) Frontend integration note
The frontend should call the backend at the right base URL, usually:
- `http://localhost:5001`

If you change the backend port in `server.js`/config, update the frontend accordingly.

---

## 8) Recommended checklist before you start
- [ ] Node.js installed
- [ ] SQL Server installed + running
- [ ] Database exists + tables created
- [ ] `db.js` or `.env` configured correctly
- [ ] `npm install` succeeded
- [ ] `npm run dev` (or `npm start`) works

---

## Files that might be relevant in this repo
- `server.js`
- `src/config/db.js`
- `src/routes/` (API routes)
- `scripts/` (SQL scripts / migrations)

---

## Troubleshooting
If something fails, capture:
- terminal error output
- SQL Server error/log details
- your DB connection string values (hide passwords)

Then we can pinpoint the failing step quickly.

