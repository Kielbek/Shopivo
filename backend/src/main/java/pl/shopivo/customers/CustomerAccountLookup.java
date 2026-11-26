package pl.shopivo.customers;

import java.time.Instant;
import java.util.Collection;
import java.util.Map;

/** SPI (implemented by the accounts module): which customers have an active store account, by lower-case e-mail. */
public interface CustomerAccountLookup {

    Map<String, Instant> verifiedAccountsCreatedAt(Collection<String> emails);
}
