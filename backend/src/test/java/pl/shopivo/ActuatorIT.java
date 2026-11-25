package pl.shopivo;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalManagementPort;
import pl.shopivo.support.IntegrationTest;

/** Probes must be reachable without authentication on the management port (used by the orchestrator). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ActuatorIT extends IntegrationTest {

    @LocalManagementPort
    int managementPort;

    private HttpResponse<String> get(String path) throws Exception {
        return HttpClient.newHttpClient().send(
                HttpRequest.newBuilder(URI.create("http://localhost:" + managementPort + path)).build(),
                HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void healthProbesArePublicAndDoNotLeakDetails() throws Exception {
        var readiness = get("/actuator/health/readiness");
        assertThat(readiness.statusCode()).isEqualTo(200);
        assertThat(readiness.body()).contains("UP");
        assertThat(get("/actuator/health/liveness").statusCode()).isEqualTo(200);
        assertThat(get("/actuator/health").body()).doesNotContain("db").doesNotContain("redis");
        assertThat(get("/actuator/env").statusCode()).isIn(401, 403, 404);
        assertThat(get("/actuator/prometheus").statusCode()).isEqualTo(200);
    }

    @Test
    void actuatorIsNotServedOnTheApplicationPort() throws Exception {
        for (String path : new String[] {"/actuator/health", "/actuator/prometheus"}) {
            int status = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(path))
                    .andReturn().getResponse().getStatus();
            assertThat(status).as(path).isIn(401, 403, 404);
        }
    }
}
