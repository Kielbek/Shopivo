-- =====================================================================================
-- V9 — product reviews. Only customers who bought the product can review it: a one-time
-- invitation (token sent by e-mail once the order is completed) lists the order's products.
-- Reviews are moderated by the store before they are shown.
-- =====================================================================================

CREATE TABLE review_invitations
(
    id         uuid PRIMARY KEY,
    tenant_id  uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    order_id   uuid        NOT NULL,
    token_hash varchar(64) NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT review_invitations_order_uk UNIQUE (order_id),
    CONSTRAINT review_invitations_token_uk UNIQUE (token_hash)
);

CREATE TABLE product_reviews
(
    id           uuid PRIMARY KEY,
    tenant_id    uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    product_id   uuid         NOT NULL,
    order_id     uuid         NOT NULL,
    author_name  varchar(60)  NOT NULL,
    rating       smallint     NOT NULL,
    body         varchar(2000),
    status       varchar(10)  NOT NULL DEFAULT 'PENDING',
    reply        varchar(2000),
    replied_at   timestamptz,
    moderated_at timestamptz,
    moderated_by uuid,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT product_reviews_rating_ck CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT product_reviews_status_ck CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    CONSTRAINT product_reviews_order_product_uk UNIQUE (order_id, product_id)
);
CREATE INDEX product_reviews_public_idx ON product_reviews (tenant_id, product_id, status, created_at DESC);
CREATE INDEX product_reviews_moderation_idx ON product_reviews (tenant_id, status, created_at DESC);

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['review_invitations', 'product_reviews']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY %I ON %I USING (app_bypass_rls() OR tenant_id = app_current_tenant()) '
                       || 'WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant())', t || '_isolation', t);
    END LOOP;
END
$$;
