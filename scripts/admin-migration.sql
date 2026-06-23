-- =============================================================================
-- Admin Module Migration — Skills Matrix Portal (Dawlance)
-- Target: SQL Server 2016 (SSMS 2016 compatible)
-- Run this script once against Dawlance_Skil_Matrix database.
-- =============================================================================

USE Dawlance_Skil_Matrix;
GO

-- =============================================================================
-- STEP 2: Singleton admin enforcement
-- Filtered unique index: only ONE row may have role = 'ADMIN'
-- =============================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE  object_id = OBJECT_ID(N'dawlance_user')
      AND  name      = N'UX_single_admin'
)
BEGIN
    CREATE UNIQUE INDEX UX_single_admin
        ON dawlance_user (role)
        WHERE role = 'ADMIN';

    PRINT 'Filtered unique index UX_single_admin created.';
END
ELSE
    PRINT 'Index UX_single_admin already exists — skipped.';
GO

-- =============================================================================
-- STEP 3: pending_password_requests table
-- =============================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.objects
    WHERE  object_id = OBJECT_ID(N'pending_password_requests')
      AND  type      = 'U'
)
BEGIN
    CREATE TABLE pending_password_requests (
        id                      NVARCHAR(64)    NOT NULL
            CONSTRAINT PK_pending_password_requests PRIMARY KEY,

        user_id                 NVARCHAR(64)    NOT NULL
            CONSTRAINT FK_ppr_user REFERENCES dawlance_user (_id) ON DELETE CASCADE,

        -- bcrypt hash of the desired new password
        desired_password_hash   NVARCHAR(500)   NOT NULL,

        status                  NVARCHAR(20)    NOT NULL
            CONSTRAINT DF_ppr_status   DEFAULT 'pending'
            CONSTRAINT CHK_ppr_status  CHECK (status IN ('pending', 'approved', 'rejected')),

        rejection_reason        NVARCHAR(1000)  NULL,

        requested_at            DATETIME2       NOT NULL
            CONSTRAINT DF_ppr_requested_at DEFAULT GETDATE(),

        resolved_at             DATETIME2       NULL
    );

    CREATE INDEX IX_ppr_user_id ON pending_password_requests (user_id);
    CREATE INDEX IX_ppr_status  ON pending_password_requests (status);

    PRINT 'Table pending_password_requests created.';
END
ELSE
    PRINT 'Table pending_password_requests already exists — skipped.';
GO

-- =============================================================================
-- STEP 4: admin_audit_log table (append-only — no UPDATE/DELETE granted)
-- =============================================================================
IF NOT EXISTS (
    SELECT 1 FROM sys.objects
    WHERE  object_id = OBJECT_ID(N'admin_audit_log')
      AND  type      = 'U'
)
BEGIN
    CREATE TABLE admin_audit_log (
        id              NVARCHAR(64)    NOT NULL
            CONSTRAINT PK_admin_audit_log PRIMARY KEY,

        -- Who performed the action (admin user _id)
        actor_id        NVARCHAR(64)    NOT NULL,

        -- Action type: password_reset | account_deleted | pw_approved |
        --              pw_rejected | password_viewed
        action          NVARCHAR(100)   NOT NULL,

        -- The user the action was performed on (NULL for non-user actions)
        target_id       NVARCHAR(64)    NULL,

        -- JSON blob for extra context (email, reason, etc.)
        metadata        NVARCHAR(MAX)   NULL,

        performed_at    DATETIME2       NOT NULL
            CONSTRAINT DF_aal_performed_at DEFAULT GETDATE()
    );

    CREATE INDEX IX_aal_actor_id    ON admin_audit_log (actor_id);
    CREATE INDEX IX_aal_target_id   ON admin_audit_log (target_id);
    CREATE INDEX IX_aal_performed_at ON admin_audit_log (performed_at DESC);

    PRINT 'Table admin_audit_log created.';
END
ELSE
    PRINT 'Table admin_audit_log already exists — skipped.';
GO

-- =============================================================================
-- STEP 5: Deny UPDATE and DELETE on audit log for the application DB user
-- Keeps the log append-only at the database permission level.
-- Replace 'sa' with your actual application login if different.
-- =============================================================================
-- DENY DELETE ON admin_audit_log TO sa;
-- DENY UPDATE ON admin_audit_log TO sa;
-- (Uncomment and adjust the login name if you have a dedicated app user)

PRINT '';
PRINT '=== Admin module migration complete ===';
GO
