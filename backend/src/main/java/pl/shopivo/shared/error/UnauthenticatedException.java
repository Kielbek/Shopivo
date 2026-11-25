package pl.shopivo.shared.error;

import org.springframework.http.HttpStatus;

public class UnauthenticatedException extends ApiException {

    public UnauthenticatedException() {
        super(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Wymagane zalogowanie.");
    }

    public UnauthenticatedException(String message) {
        super(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", message);
    }
}
