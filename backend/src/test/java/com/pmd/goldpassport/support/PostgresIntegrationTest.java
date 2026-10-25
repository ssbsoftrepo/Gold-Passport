package com.pmd.goldpassport.support;

import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Base class for integration tests against a real PostgreSQL.
 *
 * <ul>
 *   <li>Default: starts a throwaway {@code postgres:16-alpine} container with Testcontainers
 *       (needs Docker - this is what CI uses).</li>
 *   <li>Without Docker: export {@code PMD_TEST_DB_URL} (plus {@code PMD_TEST_DB_USERNAME} /
 *       {@code PMD_TEST_DB_PASSWORD}) pointing at an empty database you own.</li>
 * </ul>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class PostgresIntegrationTest {

    private static final PostgreSQLContainer<?> POSTGRES;

    static {
        if (System.getenv("PMD_TEST_DB_URL") == null) {
            POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");
            POSTGRES.start();
        } else {
            POSTGRES = null;
        }
    }

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        if (POSTGRES != null) {
            registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
            registry.add("spring.datasource.username", POSTGRES::getUsername);
            registry.add("spring.datasource.password", POSTGRES::getPassword);
        } else {
            registry.add("spring.datasource.url", () -> System.getenv("PMD_TEST_DB_URL"));
            registry.add("spring.datasource.username", () -> envOr("PMD_TEST_DB_USERNAME", "goldpassport"));
            registry.add("spring.datasource.password", () -> envOr("PMD_TEST_DB_PASSWORD", "goldpassport"));
        }
    }

    private static String envOr(String name, String fallback) {
        String v = System.getenv(name);
        return v == null ? fallback : v;
    }
}
