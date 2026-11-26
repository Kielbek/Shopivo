package pl.shopivo.support;

import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import pl.shopivo.email.EmailMessage;
import pl.shopivo.email.EmailSender;

/** Test double: collects e-mails instead of sending them over SMTP. */
public class CapturingEmailSender implements EmailSender {

    private static final Pattern TOKEN = Pattern.compile("[?&]token=([A-Za-z0-9_-]+)");
    private final List<EmailMessage> sent = new CopyOnWriteArrayList<>();

    @Override
    public void send(EmailMessage message) {
        sent.add(message);
    }

    public List<EmailMessage> sent() {
        return List.copyOf(sent);
    }

    public EmailMessage awaitEmail(String to, String subjectFragment) {
        return await().atMost(Duration.ofSeconds(10)).until(() -> sent.stream()
                .filter(m -> m.to().equalsIgnoreCase(to) && m.subject().contains(subjectFragment))
                .reduce((a, b) -> b).orElse(null), m -> m != null);
    }

    public String awaitToken(String to, String subjectFragment) {
        EmailMessage message = awaitEmail(to, subjectFragment);
        Matcher m = TOKEN.matcher(message.htmlBody());
        if (!m.find()) {
            throw new AssertionError("No token link in e-mail: " + message.subject());
        }
        return m.group(1);
    }

    public long count(String to, String subjectFragment) {
        return sent.stream().filter(m -> m.to().equalsIgnoreCase(to) && m.subject().contains(subjectFragment)).count();
    }

    public void clear() {
        sent.clear();
    }

    /** Forgets the e-mails sent to one address (other tests running in the same context are unaffected). */
    public void clear(String to) {
        sent.removeIf(m -> m.to().equalsIgnoreCase(to));
    }
}
