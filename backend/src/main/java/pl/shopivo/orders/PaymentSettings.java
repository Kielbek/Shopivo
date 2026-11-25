package pl.shopivo.orders;

import java.math.BigInteger;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.shopivo.audit.AuditEntry;
import pl.shopivo.audit.AuditLog;
import pl.shopivo.orders.OrderModel.PaymentSettingsView;
import pl.shopivo.shared.error.BusinessRuleException;
import pl.shopivo.shared.error.ConflictException;
import pl.shopivo.shared.tenancy.TenantContext;

/** Offline payment methods of a store: traditional bank transfer and cash on delivery. */
@Service
public class PaymentSettings {

    private final JdbcTemplate jdbc;
    private final AuditLog auditLog;

    PaymentSettings(JdbcTemplate jdbc, AuditLog auditLog) {
        this.jdbc = jdbc;
        this.auditLog = auditLog;
    }

    @Transactional(readOnly = true)
    public PaymentSettingsView current() {
        return jdbc.query("select * from store_payment_settings where tenant_id = ?", (rs, i) -> new PaymentSettingsView(
                rs.getBoolean("bank_transfer_enabled"), rs.getString("bank_account_holder"), rs.getString("bank_account_number"),
                rs.getString("bank_name"), rs.getBoolean("cod_enabled"), rs.getLong("cod_fee_minor"), rs.getInt("unpaid_cancel_days"),
                rs.getLong("version")), TenantContext.requireTenantId()).stream().findFirst()
                .orElse(new PaymentSettingsView(false, null, null, null, false, 0, 7, -1));
    }

    @Transactional
    public PaymentSettingsView update(PaymentSettingsView in) {
        String account = in.bankAccountNumber() == null ? null : in.bankAccountNumber().replaceAll("[\\s-]", "").toUpperCase();
        if (account != null && account.isEmpty()) account = null;
        if (account != null && account.matches("\\d{26}")) account = "PL" + account;
        if (in.bankTransferEnabled()) {
            if (account == null || !validIban(account)) {
                throw new BusinessRuleException("INVALID_IBAN", "Podaj prawidłowy numer rachunku (26 cyfr lub IBAN).");
            }
            if (in.bankAccountHolder() == null || in.bankAccountHolder().isBlank()) {
                throw new BusinessRuleException("HOLDER_REQUIRED", "Podaj odbiorcę przelewu.");
            }
        } else if (account != null && !validIban(account)) {
            throw new BusinessRuleException("INVALID_IBAN", "Nieprawidłowy numer rachunku.");
        }
        if (in.codFeeMinor() < 0 || in.codFeeMinor() > 100_000) throw new BusinessRuleException("INVALID_FEE", "Nieprawidłowa opłata za pobranie.");
        if (in.unpaidCancelDays() < 1 || in.unpaidCancelDays() > 60) throw new BusinessRuleException("INVALID_DAYS", "Termin płatności: 1–60 dni.");
        UUID tenant = TenantContext.requireTenantId();
        long current = current().version();
        if (current >= 0 && current != in.version()) {
            throw new ConflictException("VERSION_CONFLICT", "Ustawienia zostały w międzyczasie zmienione. Odśwież stronę.");
        }
        jdbc.update("""
                insert into store_payment_settings (tenant_id, bank_transfer_enabled, bank_account_holder, bank_account_number, bank_name,
                    cod_enabled, cod_fee_minor, unpaid_cancel_days)
                values (?, ?, ?, ?, ?, ?, ?, ?)
                on conflict (tenant_id) do update set bank_transfer_enabled = excluded.bank_transfer_enabled,
                    bank_account_holder = excluded.bank_account_holder, bank_account_number = excluded.bank_account_number,
                    bank_name = excluded.bank_name, cod_enabled = excluded.cod_enabled, cod_fee_minor = excluded.cod_fee_minor,
                    unpaid_cancel_days = excluded.unpaid_cancel_days, updated_at = now(),
                    version = store_payment_settings.version + 1
                """, tenant, in.bankTransferEnabled(), trim(in.bankAccountHolder(), 200), account, trim(in.bankName(), 100),
                in.codEnabled(), in.codFeeMinor(), in.unpaidCancelDays());
        auditLog.record(AuditEntry.tenant("store.payment_settings.updated", tenant, "store", tenant));
        return current();
    }

    /** ISO 13616 mod-97 check. */
    static boolean validIban(String iban) {
        if (!iban.matches("[A-Z]{2}\\d{2}[A-Z0-9]{10,30}") || (iban.startsWith("PL") && iban.length() != 28)) return false;
        String rearranged = iban.substring(4) + iban.substring(0, 4);
        StringBuilder digits = new StringBuilder();
        for (char c : rearranged.toCharArray()) digits.append(Character.isLetter(c) ? String.valueOf(c - 'A' + 10) : String.valueOf(c));
        return new BigInteger(digits.toString()).mod(BigInteger.valueOf(97)).intValue() == 1;
    }

    private static String trim(String s, int max) {
        if (s == null || s.isBlank()) return null;
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }
}
