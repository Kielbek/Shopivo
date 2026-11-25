package pl.shopivo.shared.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "shopivo")
public record ShopivoProperties(
        String platformDomain,
        String appUrl,
        String adminUrl,
        Mail mail,
        Security security,
        Tenancy tenancy,
        Bootstrap bootstrap) {

    public record Mail(String from) {
    }

    public record Security(
            @DefaultValue("true") boolean cookieSecure,
            Session session,
            Login login,
            Encryption encryption) {
    }

    public record Session(
            @DefaultValue("12h") Duration idleTimeout,
            @DefaultValue("7d") Duration rememberMeIdleTimeout,
            @DefaultValue("30d") Duration absoluteTimeout,
            @DefaultValue("5m") Duration touchInterval) {
    }

    public record Login(
            @DefaultValue("10") int maxFailedAttempts,
            @DefaultValue("15m") Duration lockDuration) {
    }

    public record Encryption(String keys, @DefaultValue("1") int activeKey) {
    }

    public record Tenancy(@DefaultValue("10") int maxStoresPerUser) {
    }

    public record Bootstrap(String adminEmail, String adminPassword) {
    }
}
