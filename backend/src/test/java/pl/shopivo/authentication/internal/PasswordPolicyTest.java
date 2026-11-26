package pl.shopivo.authentication.internal;

import pl.shopivo.shared.security.PasswordPolicy;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import pl.shopivo.shared.error.BusinessRuleException;

class PasswordPolicyTest {

    private final PasswordPolicy policy = new PasswordPolicy();

    @Test
    void acceptsLongUncommonPassphrase() {
        assertThatCode(() -> policy.validate("zielony rower nad Wisłą", "jan@example.com")).doesNotThrowAnyException();
    }

    @Test
    void rejectsShortCommonAndEmailDerivedPasswords() {
        assertThatThrownBy(() -> policy.validate("krotkie", "a@b.pl")).isInstanceOf(BusinessRuleException.class);
        assertThatThrownBy(() -> policy.validate("Password123", "a@b.pl")).isInstanceOf(BusinessRuleException.class);
        assertThatThrownBy(() -> policy.validate("aaaaaaaaaaaa", "a@b.pl")).isInstanceOf(BusinessRuleException.class);
        assertThatThrownBy(() -> policy.validate("kowalski-2026!", "kowalski@firma.pl")).isInstanceOf(BusinessRuleException.class);
        assertThatThrownBy(() -> policy.validate("x".repeat(129), "a@b.pl")).isInstanceOf(BusinessRuleException.class);
    }
}
