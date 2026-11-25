package pl.shopivo.support;

import org.testcontainers.containers.GenericContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.MountableFile;

/** Singleton containers shared by all integration tests (started once per JVM). */
public final class TestContainers {

    public static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine")
            .withDatabaseName("shopivo")
            .withUsername("shopivo_owner")
            .withPassword("owner")
            .withCopyFileToContainer(MountableFile.forClasspathResource("db/test-init.sql"),
                    "/docker-entrypoint-initdb.d/00-init.sql");

    public static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);

    static {
        POSTGRES.start();
        REDIS.start();
    }

    private TestContainers() {
    }

    public static String appJdbcUrl() {
        return POSTGRES.getJdbcUrl();
    }
}
