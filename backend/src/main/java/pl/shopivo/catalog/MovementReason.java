package pl.shopivo.catalog;

/** Why the stock changed. SALE / ORDER_CANCELED / RETURN are written by the orders module. */
public enum MovementReason { INITIAL, RECEIPT, ADJUSTMENT, DAMAGE, RETURN, SALE, ORDER_CANCELED, CORRECTION }
