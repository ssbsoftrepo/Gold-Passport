package com.pmd.goldpassport.transport.internal;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code pmd.transport.*}
 *
 * @param locationMismatchKm arrival further than this from the lot's photo evidence is flagged
 * @param maxClockSkew       device timestamps further in the future are rejected
 */
@ConfigurationProperties(prefix = "pmd.transport")
public record TransportProperties(double locationMismatchKm, Duration maxClockSkew) {
}
