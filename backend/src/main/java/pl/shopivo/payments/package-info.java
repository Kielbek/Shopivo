/**
 * Payment operator adapters for the Polish market (Przelewy24, PayU, Tpay). Used with platform credentials for
 * subscription billing and — in phase 5 — with each merchant's own credentials for store checkout.
 * Card data never touches Shopivo: customers pay on the operator's page (redirect), PCI DSS SAQ A.
 */
package pl.shopivo.payments;
