package pl.shopivo.stores;

import java.util.List;

/** Extension point: what still blocks publishing the current store (Polish messages for the merchant). */
public interface StorePublishCheck {

    List<String> missingForPublish();
}
