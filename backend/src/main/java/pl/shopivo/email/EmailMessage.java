package pl.shopivo.email;

import java.util.Objects;

public record EmailMessage(String to, String subject, String htmlBody, String textBody) {

    public EmailMessage {
        Objects.requireNonNull(to, "to");
        Objects.requireNonNull(subject, "subject");
        Objects.requireNonNull(htmlBody, "htmlBody");
    }
}
