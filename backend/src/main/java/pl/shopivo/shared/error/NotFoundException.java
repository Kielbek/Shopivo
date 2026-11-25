package pl.shopivo.shared.error;

import org.springframework.http.HttpStatus;

public class NotFoundException extends ApiException {

    public NotFoundException() {
        super(HttpStatus.NOT_FOUND, "NOT_FOUND", "Nie znaleziono zasobu.");
    }

    public NotFoundException(String message) {
        super(HttpStatus.NOT_FOUND, "NOT_FOUND", message);
    }
}
