package pl.shopivo.payments;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/** Registry of available operator adapters (Spring beans implementing {@link PaymentGateway}). */
@Component
public class PaymentGateways {

    private final Map<String, PaymentGateway> byId;

    PaymentGateways(List<PaymentGateway> gateways) {
        this.byId = gateways.stream().collect(Collectors.toMap(PaymentGateway::id, Function.identity()));
    }

    public Optional<PaymentGateway> find(String id) {
        return Optional.ofNullable(byId.get(id));
    }

    public PaymentGateway get(String id) {
        return find(id).orElseThrow(() -> new GatewayException("Nieobsługiwany operator płatności: " + id));
    }

    public List<PaymentGateway> all() {
        return byId.values().stream().sorted(Comparator.comparing(g -> g.descriptor().name())).toList();
    }
}
