package pl.shopivo.shared.error;

import java.net.URI;
import java.util.Map;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;

public final class ProblemDetails {

    private static final String TYPE_BASE = "https://docs.shopivo.pl/errors/";

    private ProblemDetails() {
    }

    public static ProblemDetail of(HttpStatusCode status, String code, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setType(URI.create(TYPE_BASE + code.toLowerCase().replace('_', '-')));
        problem.setProperty("code", code);
        return problem;
    }

    public static ProblemDetail of(ApiException ex) {
        ProblemDetail problem = of(ex.status(), ex.code(), ex.getMessage());
        Map<String, Object> props = ex.properties();
        if (props != null) {
            props.forEach(problem::setProperty);
        }
        return problem;
    }
}
