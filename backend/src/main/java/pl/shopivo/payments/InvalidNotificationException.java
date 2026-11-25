package pl.shopivo.payments;

/** Notification signature/verification failed — the request must be rejected and not processed. */
public class InvalidNotificationException extends RuntimeException {

    public InvalidNotificationException(String message) {
        super(message);
    }
}
