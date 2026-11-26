package pl.shopivo.stores;

/**
 * Extension point: reports data that is denominated in the store currency (prices, orders). While any guard reports
 * such data, the store currency cannot be changed — amounts would silently change their meaning.
 */
public interface CurrencyChangeGuard {

    /** @return a short reason (Polish, for the merchant) or {@code null} when the change is safe. Current tenant. */
    String blockingReason();
}
