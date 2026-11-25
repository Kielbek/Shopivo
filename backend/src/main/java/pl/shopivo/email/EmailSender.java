package pl.shopivo.email;

/** Delivers a fully rendered e-mail. Throws on failure so callers (event listeners) can be retried. */
public interface EmailSender {

    void send(EmailMessage message);
}
