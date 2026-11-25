package pl.shopivo.authentication.internal;

import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Component;
import pl.shopivo.shared.error.BusinessRuleException;

/**
 * NIST SP 800-63B aligned policy: length over composition rules, blocklist of common passwords,
 * no passwords derived from the e-mail address. Breached-password lookup (HIBP k-anonymity) is planned for phase 8.
 */
@Component
class PasswordPolicy {

    static final int MIN_LENGTH = 10;
    static final int MAX_LENGTH = 128;

    private static final Set<String> COMMON = Set.of(
            "1234567890", "12345678910", "123456789a", "qwertyuiop", "1q2w3e4r5t", "1qaz2wsx3edc", "password1",
            "password12", "password123", "passw0rd123", "haslo12345", "haslo123456", "zaq12wsxcde", "zaq1@wsx",
            "qwerty1234", "qwerty12345", "polska1234", "polska12345", "iloveyou12", "administrator", "admin12345",
            "abcdefghij", "0987654321", "1111111111", "0000000000", "aaaaaaaaaa", "kochamcie1", "kochamcie12",
            "monika1234", "marcin1234", "mateusz123", "lewandowski", "dragon1234", "football12", "sklep12345",
            "shopivo123", "shopivo2026", "welcome123", "letmein123", "qazwsxedc1");

    void validate(String password, String email) {
        if (password == null || password.length() < MIN_LENGTH) {
            throw weak("Hasło musi mieć co najmniej " + MIN_LENGTH + " znaków.", "TOO_SHORT");
        }
        if (password.length() > MAX_LENGTH) {
            throw weak("Hasło może mieć maksymalnie " + MAX_LENGTH + " znaków.", "TOO_LONG");
        }
        String lower = password.toLowerCase(Locale.ROOT);
        if (COMMON.contains(lower) || lower.chars().distinct().count() < 4) {
            throw weak("To hasło jest zbyt popularne lub zbyt proste. Wybierz inne.", "TOO_COMMON");
        }
        if (email != null) {
            String local = email.toLowerCase(Locale.ROOT).split("@")[0];
            if (local.length() >= 4 && lower.contains(local)) {
                throw weak("Hasło nie może zawierać nazwy z adresu e-mail.", "CONTAINS_EMAIL");
            }
        }
    }

    private static BusinessRuleException weak(String message, String reason) {
        return new BusinessRuleException("WEAK_PASSWORD", message, java.util.Map.of("reason", reason));
    }
}
