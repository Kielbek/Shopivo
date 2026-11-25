package pl.shopivo.shared.error;

import org.springframework.http.HttpStatus;

public class AccessDeniedApiException extends ApiException {

    public AccessDeniedApiException() {
        super(HttpStatus.FORBIDDEN, "ACCESS_DENIED", "Brak uprawnień do wykonania tej operacji.");
    }

    public AccessDeniedApiException(String message) {
        super(HttpStatus.FORBIDDEN, "ACCESS_DENIED", message);
    }
}
