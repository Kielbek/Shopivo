/**
 * SaaS subscriptions: plan catalogue and entitlements (data, editable by administrators), the subscription
 * lifecycle (trial → active → renewal / past due → grace → expired), charges paid through the platform payment
 * operator, usage metering (fair use) and the extension-point implementations that enforce plan limits in other
 * modules. This module sits above the business modules; they never depend on it.
 */
package pl.shopivo.subscriptions;
