package pl.shopivo.authentication.internal;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import pl.shopivo.shared.error.ProblemDetails;
import tools.jackson.databind.json.JsonMapper;

@Component
class ProblemResponseWriter {

    private final JsonMapper jsonMapper;

    ProblemResponseWriter(JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
    }

    void write(HttpServletResponse response, HttpStatus status, String code, String detail) throws IOException {
        if (response.isCommitted()) {
            return;
        }
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        jsonMapper.writeValue(response.getOutputStream(), ProblemDetails.of(status, code, detail));
    }
}
