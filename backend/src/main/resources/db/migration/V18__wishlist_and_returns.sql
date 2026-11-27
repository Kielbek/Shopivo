-- Favourite products of a customer account, and return / complaint requests submitted from the account.

CREATE TABLE customer_wishlist
(
    tenant_id  uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    account_id uuid        NOT NULL REFERENCES customer_accounts (id) ON DELETE CASCADE,
    product_id uuid        NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, product_id)
);
CREATE INDEX customer_wishlist_tenant_idx ON customer_wishlist (tenant_id, account_id, created_at DESC);

ALTER TABLE customer_wishlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_wishlist_isolation ON customer_wishlist
    USING (app_bypass_rls() OR tenant_id = app_current_tenant())
    WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());

-- WITHDRAWAL = statutory 14-day withdrawal from a distance contract; COMPLAINT = complaint about non-conformity.
CREATE TABLE return_requests
(
    id              uuid PRIMARY KEY,
    tenant_id       uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    number          bigint       NOT NULL,
    order_id        uuid         NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    kind            varchar(20)  NOT NULL CHECK (kind IN ('WITHDRAWAL', 'COMPLAINT')),
    status          varchar(20)  NOT NULL CHECK (status IN ('REQUESTED', 'ACCEPTED', 'REJECTED', 'COMPLETED')),
    reason          varchar(2000),
    refund_account  varchar(40),
    merchant_note   varchar(2000),
    created_at      timestamptz  NOT NULL DEFAULT now(),
    decided_at      timestamptz,
    completed_at    timestamptz,
    version         bigint       NOT NULL DEFAULT 0,
    CONSTRAINT return_requests_number_uq UNIQUE (tenant_id, number)
);
CREATE INDEX return_requests_status_idx ON return_requests (tenant_id, status, created_at DESC);
CREATE INDEX return_requests_order_idx ON return_requests (order_id);

CREATE TABLE return_request_items
(
    return_id     uuid    NOT NULL REFERENCES return_requests (id) ON DELETE CASCADE,
    tenant_id     uuid    NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    order_item_id uuid    NOT NULL REFERENCES order_items (id) ON DELETE CASCADE,
    quantity      integer NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (return_id, order_item_id)
);

ALTER TABLE return_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY return_requests_isolation ON return_requests
    USING (app_bypass_rls() OR tenant_id = app_current_tenant())
    WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());
ALTER TABLE return_request_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY return_request_items_isolation ON return_request_items
    USING (app_bypass_rls() OR tenant_id = app_current_tenant())
    WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant());
