package pl.shopivo.shared.error;

import java.time.Duration;
import java.util.Map;
import org.springframework.http.HttpStatus;

public class RateLimitedException extends ApiException {

    private final Duration retryAfter;

    public RateLimitedException(Duration retryAfter) {
        super(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED",
                "Zbyt wiele prób. Spróbuj ponownie za chwilę.",
                Map.of("retryAfterSeconds", Math.max(1, retryAfter.toSeconds())));
        this.retryAfter = retryAfter;
    }

    public Duration retryAfter() {
        return retryAfter;
    }
}
