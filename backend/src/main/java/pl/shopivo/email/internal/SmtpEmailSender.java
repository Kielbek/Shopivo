package pl.shopivo.email.internal;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;
import pl.shopivo.email.EmailMessage;
import pl.shopivo.email.EmailSender;
import pl.shopivo.shared.config.ShopivoProperties;

@Component
class SmtpEmailSender implements EmailSender {

    private static final Logger log = LoggerFactory.getLogger(SmtpEmailSender.class);

    private final JavaMailSender mailSender;
    private final ShopivoProperties properties;

    SmtpEmailSender(JavaMailSender mailSender, ShopivoProperties properties) {
        this.mailSender = mailSender;
        this.properties = properties;
    }

    @Override
    public void send(EmailMessage message) {
        try {
            MimeMessage mime = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mime, true, StandardCharsets.UTF_8.name());
            helper.setFrom(properties.mail().from());
            helper.setTo(message.to());
            helper.setSubject(message.subject());
            helper.setText(message.textBody() == null ? "" : message.textBody(), message.htmlBody());
            mailSender.send(mime);
            log.debug("E-mail '{}' sent", message.subject());
        } catch (MessagingException e) {
            throw new IllegalStateException("Could not build e-mail message", e);
        }
    }
}
