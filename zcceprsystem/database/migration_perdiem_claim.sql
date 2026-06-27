-- ============================================================================
-- Per Diem / Travel & Subsistence Claim Module
-- Linked 1:1 to the requests table (one claim per request max)
-- ============================================================================

-- Add flag to requests so the system knows whether a claim exists
ALTER TABLE requests
  ADD COLUMN has_per_diem_claim TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = this request includes a Travel & Subsistence Claim form';

-- ----------------------------------------------------------------------------
-- A) Claim header — employee details + financial totals
-- ----------------------------------------------------------------------------
CREATE TABLE per_diem_claims (
  id                          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  request_id                  INT             NOT NULL,

  -- Employee details (section A)
  full_name                   VARCHAR(255)    NOT NULL,
  designation                 VARCHAR(255)    NOT NULL,
  project_id                  INT             NULL,
  strategic_focus             VARCHAR(255)    NULL,
  budget_line_id              INT             NULL,

  -- Trip period (informational, derived from trip items)
  trip_start_date             DATE            NULL,
  trip_end_date               DATE            NULL,

  -- Financial totals (section C)
  total_claimed               DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
  less_outstanding_advance    DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
  amount_payable              DECIMAL(15,2)   NOT NULL DEFAULT 0.00  COMMENT 'total_claimed - less_outstanding_advance; negative = refundable',

  -- Reconciliation control
  advance_reconciliation_due  DATE            NULL    COMMENT 'Return date + 5 days',
  reconciled_at               DATETIME        NULL,

  -- Audit
  created_by                  INT             NOT NULL,
  created_at                  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_per_diem_request (request_id),
  INDEX idx_pdc_request    (request_id),
  INDEX idx_pdc_project    (project_id),
  INDEX idx_pdc_created_by (created_by),
  CONSTRAINT fk_pdc_request     FOREIGN KEY (request_id)   REFERENCES requests     (id) ON DELETE CASCADE,
  CONSTRAINT fk_pdc_project     FOREIGN KEY (project_id)   REFERENCES projects     (id) ON DELETE SET NULL,
  CONSTRAINT fk_pdc_budget_line FOREIGN KEY (budget_line_id) REFERENCES budget_lines(id) ON DELETE SET NULL,
  CONSTRAINT fk_pdc_created_by  FOREIGN KEY (created_by)   REFERENCES users        (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Travel & Subsistence Claim header';

-- ----------------------------------------------------------------------------
-- B) Trip line items (repeatable rows — section B)
-- ----------------------------------------------------------------------------
CREATE TABLE per_diem_trip_items (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  claim_id            INT UNSIGNED  NOT NULL,
  row_order           TINYINT       NOT NULL DEFAULT 0,

  trip_date           DATE          NOT NULL,
  from_location       VARCHAR(255)  NOT NULL,
  to_location         VARCHAR(255)  NOT NULL,
  departure_time      TIME          NOT NULL,
  arrival_time        TIME          NOT NULL,
  purpose             VARCHAR(500)  NOT NULL,

  -- Meal flags (validation enforced at app layer and stored as booleans)
  breakfast           TINYINT(1)    NOT NULL DEFAULT 0  COMMENT 'Allowed only if departure < 08:00',
  lunch               TINYINT(1)    NOT NULL DEFAULT 0,
  dinner              TINYINT(1)    NOT NULL DEFAULT 0  COMMENT 'Allowed only if arrival > 20:00',
  overnight_stay      TINYINT(1)    NOT NULL DEFAULT 0,

  -- Rates used at time of submission (stored so report is reproducible)
  rate_breakfast      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  rate_lunch          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  rate_dinner         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  rate_overnight      DECIMAL(10,2) NOT NULL DEFAULT 0.00  COMMENT 'Out-of-pocket / incidentals',
  rate_accommodation  DECIMAL(10,2) NOT NULL DEFAULT 0.00  COMMENT 'Overnight hotel / lodging',

  accommodation       TINYINT(1)    NOT NULL DEFAULT 0     COMMENT '1 if accommodation was claimed',

  line_total          DECIMAL(15,2) NOT NULL DEFAULT 0.00,

  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_pdti_claim (claim_id),
  CONSTRAINT fk_pdti_claim FOREIGN KEY (claim_id) REFERENCES per_diem_claims (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Individual trip/day rows for a per diem claim';

-- ----------------------------------------------------------------------------
-- D) Cost distribution (repeatable rows — section D)
-- ----------------------------------------------------------------------------
CREATE TABLE per_diem_cost_distribution (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  claim_id        INT UNSIGNED  NOT NULL,
  row_order       TINYINT       NOT NULL DEFAULT 0,

  account_name    VARCHAR(255)  NOT NULL,
  account_code    VARCHAR(100)  NOT NULL,
  partner_project VARCHAR(255)  NULL,
  amount          DECIMAL(15,2) NOT NULL DEFAULT 0.00,

  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_pdcd_claim (claim_id),
  CONSTRAINT fk_pdcd_claim FOREIGN KEY (claim_id) REFERENCES per_diem_claims (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Cost distribution lines for a per diem claim';
