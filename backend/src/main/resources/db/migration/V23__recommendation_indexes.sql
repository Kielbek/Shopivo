-- Recommendations: sales per product (bestsellers, "bought together") and recent stock changes ("back in stock").
CREATE INDEX order_items_product_idx ON order_items (tenant_id, product_id, order_id);
CREATE INDEX inventory_movements_recent_idx ON inventory_movements (tenant_id, created_at DESC);
