package com.pmd.goldpassport.shared;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Cross-cutting beans. Services take a {@link Clock} so tests can control time. */
@Configuration(proxyBeanMethods = false)
public class SharedConfig {

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
