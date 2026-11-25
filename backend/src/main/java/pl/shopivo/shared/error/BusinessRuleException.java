package pl.shopivo.shared.error;

import java.util.Map;
import org.springframework.http.HttpStatus;

/** A request that is well-formed but violates a business rule (HTTP 422). */
public class BusinessRuleException extends ApiException {

    public BusinessRuleException(String code, String message) {
        super(HttpStatus.UNPROCESSABLE_CONTENT, code, message);
    }

    public BusinessRuleException(String code, String message, Map<String, Object> properties) {
        super(HttpStatus.UNPROCESSABLE_CONTENT, code, message, properties);
    }
}
