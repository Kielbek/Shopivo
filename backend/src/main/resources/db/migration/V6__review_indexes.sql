-- =====================================================================================
-- V6 — indexes for background jobs (found in review): the hourly unpaid-transfer job and
-- the cart cleanup scan across all tenants.
-- =====================================================================================

CREATE INDEX orders_unpaid_transfer_idx ON orders (created_at)
    WHERE status = 'NEW' AND payment_status = 'UNPAID' AND payment_method = 'BANK_TRANSFER';

CREATE INDEX carts_updated_idx ON carts (updated_at);
