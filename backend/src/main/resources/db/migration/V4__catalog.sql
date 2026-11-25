-- =====================================================================================
-- V4 — catalogue: categories (tree), brands, products, options/variants, inventory with
-- an append-only movement log, and variant price history (Omnibus directive).
-- All tables are tenant data protected by RLS.
-- =====================================================================================

CREATE TABLE categories
(
    id              uuid PRIMARY KEY,
    tenant_id       uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    parent_id       uuid REFERENCES categories (id) ON DELETE RESTRICT,
    name            varchar(120) NOT NULL,
    slug            varchar(140) NOT NULL,
    description     varchar(2000),
    position        integer      NOT NULL DEFAULT 0,
    -- Materialised path of ancestor ids: '/<root>/<child>/' (includes self). Max depth enforced in the application.
    path            varchar(400) NOT NULL,
    depth           integer      NOT NULL,
    visible         boolean      NOT NULL DEFAULT true,
    seo_title       varchar(160),
    seo_description varchar(320),
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now(),
    version         bigint       NOT NULL DEFAULT 0,
    CONSTRAINT categories_slug_uk UNIQUE (tenant_id, slug),
    CONSTRAINT categories_depth_ck CHECK (depth BETWEEN 0 AND 4)
);
CREATE INDEX categories_tenant_parent_idx ON categories (tenant_id, parent_id, position);
CREATE INDEX categories_path_idx ON categories (tenant_id, path varchar_pattern_ops);

CREATE TABLE brands
(
    id         uuid PRIMARY KEY,
    tenant_id  uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    name       varchar(120) NOT NULL,
    slug       varchar(140) NOT NULL,
    created_at timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT brands_slug_uk UNIQUE (tenant_id, slug)
);

CREATE TABLE products
(
    id              uuid PRIMARY KEY,
    tenant_id       uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    name            varchar(200) NOT NULL,
    slug            varchar(220) NOT NULL,
    description     text,
    status          varchar(20)  NOT NULL,
    type            varchar(20)  NOT NULL,
    brand_id        uuid REFERENCES brands (id) ON DELETE SET NULL,
    vat_rate_bps    integer      NOT NULL,
    -- [{"name":"Rozmiar","values":["S","M"]}] — at most 3 options; variants carry the chosen values.
    options_json    text         NOT NULL DEFAULT '[]',
    seo_title       varchar(160),
    seo_description varchar(320),
    published_at    timestamptz,
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now(),
    version         bigint       NOT NULL DEFAULT 0,
    CONSTRAINT products_slug_uk UNIQUE (tenant_id, slug),
    CONSTRAINT products_status_ck CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
    CONSTRAINT products_type_ck CHECK (type IN ('PHYSICAL', 'DIGITAL')),
    CONSTRAINT products_vat_ck CHECK (vat_rate_bps IN (0, 500, 800, 2300))
);
CREATE INDEX products_tenant_status_idx ON products (tenant_id, status, updated_at DESC);
CREATE INDEX products_tenant_name_idx ON products (tenant_id, lower(name));

CREATE TABLE product_categories
(
    tenant_id   uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    product_id  uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    category_id uuid NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, category_id)
);
CREATE INDEX product_categories_category_idx ON product_categories (tenant_id, category_id);

CREATE TABLE product_variants
(
    id                uuid PRIMARY KEY,
    tenant_id         uuid         NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    product_id        uuid         NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    -- {"Rozmiar":"M","Kolor":"Czerwony"}; '{}' for the single variant of a product without options.
    option_values_json text        NOT NULL DEFAULT '{}',
    sku               varchar(64),
    ean               varchar(14),
    price_minor       bigint       NOT NULL,
    compare_at_minor  bigint,
    cost_minor        bigint,
    currency          varchar(3)   NOT NULL,
    weight_grams      integer,
    length_mm         integer,
    width_mm          integer,
    height_mm         integer,
    track_inventory   boolean      NOT NULL DEFAULT true,
    allow_backorder   boolean      NOT NULL DEFAULT false,
    position          integer      NOT NULL DEFAULT 0,
    created_at        timestamptz  NOT NULL DEFAULT now(),
    updated_at        timestamptz  NOT NULL DEFAULT now(),
    version           bigint       NOT NULL DEFAULT 0,
    CONSTRAINT product_variants_price_ck CHECK (price_minor >= 0 AND (compare_at_minor IS NULL OR compare_at_minor >= 0)
        AND (cost_minor IS NULL OR cost_minor >= 0)),
    CONSTRAINT product_variants_ean_ck CHECK (ean IS NULL OR ean ~ '^[0-9]{8,14}$')
);
CREATE INDEX product_variants_product_idx ON product_variants (tenant_id, product_id, position);
CREATE UNIQUE INDEX product_variants_sku_uk ON product_variants (tenant_id, lower(sku)) WHERE sku IS NOT NULL;

-- Omnibus: every price a variant had, so "lowest price in the 30 days before a discount" can be shown.
CREATE TABLE variant_price_history
(
    id          uuid PRIMARY KEY,
    tenant_id   uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    variant_id  uuid        NOT NULL REFERENCES product_variants (id) ON DELETE CASCADE,
    price_minor bigint      NOT NULL,
    valid_from  timestamptz NOT NULL,
    valid_to    timestamptz
);
CREATE INDEX variant_price_history_idx ON variant_price_history (tenant_id, variant_id, valid_from DESC);

CREATE TABLE inventory_items
(
    variant_id          uuid PRIMARY KEY REFERENCES product_variants (id) ON DELETE CASCADE,
    tenant_id           uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    on_hand             integer     NOT NULL DEFAULT 0,
    reserved            integer     NOT NULL DEFAULT 0,
    low_stock_threshold integer     NOT NULL DEFAULT 3,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inventory_items_ck CHECK (reserved >= 0 AND low_stock_threshold >= 0)
);
CREATE INDEX inventory_items_tenant_idx ON inventory_items (tenant_id);

CREATE TABLE inventory_movements
(
    id            uuid PRIMARY KEY,
    tenant_id     uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    variant_id    uuid        NOT NULL REFERENCES product_variants (id) ON DELETE CASCADE,
    delta         integer     NOT NULL,
    on_hand_after integer     NOT NULL,
    reason        varchar(30) NOT NULL,
    note          varchar(300),
    reference     varchar(80),
    actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inventory_movements_reason_ck CHECK (reason IN ('INITIAL', 'RECEIPT', 'ADJUSTMENT', 'DAMAGE', 'RETURN',
        'SALE', 'ORDER_CANCELED', 'CORRECTION'))
);
CREATE INDEX inventory_movements_variant_idx ON inventory_movements (tenant_id, variant_id, created_at DESC);

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['categories', 'brands', 'products', 'product_categories', 'product_variants',
                             'variant_price_history', 'inventory_items', 'inventory_movements']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('CREATE POLICY %I ON %I USING (app_bypass_rls() OR tenant_id = app_current_tenant()) '
                       || 'WITH CHECK (app_bypass_rls() OR tenant_id = app_current_tenant())', t || '_isolation', t);
    END LOOP;
END
$$;

-- The stock ledger is append-only for the application.
REVOKE UPDATE, DELETE ON inventory_movements FROM ${appRole};
