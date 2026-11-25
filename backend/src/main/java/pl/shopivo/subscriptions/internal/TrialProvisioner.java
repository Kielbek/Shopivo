package pl.shopivo.subscriptions.internal;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import pl.shopivo.stores.StoreCreatedEvent;

/** Every new store starts with a trial of the configured plan, created atomically with the store. */
@Component
class TrialProvisioner {

    private final SubscriptionEngine engine;

    TrialProvisioner(SubscriptionEngine engine) {
        this.engine = engine;
    }

    @EventListener
    void on(StoreCreatedEvent event) {
        engine.createTrial();
    }
}
