-- ============================================================
-- Migration: Cross-Department Routing
-- Adds routing_department_id to requests and proc_requests so
-- that approval can be routed to the department that owns the
-- selected project rather than the requester's own department.
-- ============================================================

-- Fund Requests
ALTER TABLE requests
  ADD COLUMN routing_department_id INT NULL DEFAULT NULL
    COMMENT 'When the selected project belongs to a different department, this stores that department ID so approvals are routed there instead of the requester''s department.',
  ADD CONSTRAINT fk_requests_routing_dept
    FOREIGN KEY (routing_department_id) REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX idx_requests_routing_dept ON requests (routing_department_id);

-- Procurement Requests
ALTER TABLE proc_requests
  ADD COLUMN routing_department_id INT NULL DEFAULT NULL
    COMMENT 'When the selected project belongs to a different department, this stores that department ID so dept-level approval is routed there.',
  ADD CONSTRAINT fk_proc_requests_routing_dept
    FOREIGN KEY (routing_department_id) REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX idx_proc_requests_routing_dept ON proc_requests (routing_department_id);
