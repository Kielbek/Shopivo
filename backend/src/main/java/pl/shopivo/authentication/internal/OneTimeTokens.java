package pl.shopivo.authentication.internal;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.shared.crypto.Tokens;

/** Single-use, expiring tokens delivered by e-mail. Issuing a new token invalidates older ones of the same purpose. */
@Component
@Transactional
class OneTimeTokens {

    private final UserTokenRepository tokens;

    OneTimeTokens(UserTokenRepository tokens) {
        this.tokens = tokens;
    }

    String issue(UUID userId, UserTokenEntity.Purpose purpose, Duration ttl) {
        Instant now = Instant.now();
        tokens.consumeAll(userId, purpose, now);
        String token = Tokens.newToken();
        tokens.save(new UserTokenEntity(userId, purpose, Tokens.sha256(token), now.plus(ttl)));
        return token;
    }

    /** Consumes the token and every other open token of the same purpose. Returns the owner if valid. */
    Optional<UUID> consume(String token, UserTokenEntity.Purpose purpose) {
        if (token == null || token.isBlank() || token.length() > 100) {
            return Optional.empty();
        }
        Instant now = Instant.now();
        return tokens.findByTokenHash(Tokens.sha256(token))
                .filter(t -> t.getPurpose() == purpose && t.isUsable(now))
                .map(t -> {
                    tokens.consumeAll(t.getUserId(), purpose, now);
                    return t.getUserId();
                });
    }

    @Scheduled(cron = "0 27 3 * * *")
    @SchedulerLock(name = "tokens.cleanup", lockAtMostFor = "PT10M")
    void cleanup() {
        tokens.deleteExpired(Instant.now().minus(Duration.ofDays(7)));
    }
}
