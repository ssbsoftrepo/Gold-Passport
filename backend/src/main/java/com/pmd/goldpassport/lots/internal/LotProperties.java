package com.pmd.goldpassport.lots.internal;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code pmd.lots.*}
 *
 * @param minPhotos     extraction photos required before a lote can be completed
 * @param maxClockSkew  how far in the future a device timestamp may be before it is rejected
 */
@ConfigurationProperties(prefix = "pmd.lots")
public record LotProperties(int minPhotos, Duration maxClockSkew) {
}
