package com.pmd.goldpassport;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableAsync;

/**
 * PMD Gold Passport - modular monolith.
 *
 * <p>Every direct sub-package of {@code com.pmd.goldpassport} is an application module
 * (verified by Spring Modulith in {@code ModularityTest}). Types in a module's base package are
 * its public API; everything in sub-packages ({@code internal}, {@code web}, ...) is private to
 * the module. Modules talk to each other through those API types and through domain events.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableAsync
public class GoldPassportApplication {

    public static void main(String[] args) {
        SpringApplication.run(GoldPassportApplication.class, args);
    }
}
