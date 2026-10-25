package com.pmd.goldpassport.shared;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ValidatorsTest {

    @Test
    void validRucPassesChecksum() {
        assertThat(Validators.isValidRuc("20601234565")).isTrue();
        assertThat(Validators.isValidRuc("20131312955")).isTrue();
    }

    @Test
    void invalidRucFails() {
        assertThat(Validators.isValidRuc("20601234566")).as("wrong check digit").isFalse();
        assertThat(Validators.isValidRuc("30601234565")).as("invalid prefix").isFalse();
        assertThat(Validators.isValidRuc("2060123456")).as("too short").isFalse();
        assertThat(Validators.isValidRuc(null)).isFalse();
    }

    @Test
    void dniIsEightDigits() {
        assertThat(Validators.isValidDocument(IdDocumentType.DNI, "45879632")).isTrue();
        assertThat(Validators.isValidDocument(IdDocumentType.DNI, "4587963")).isFalse();
        assertThat(Validators.isValidDocument(IdDocumentType.DNI, "4587963A")).isFalse();
    }

    @Test
    void phoneMustBeE164() {
        assertThat(Validators.isE164("+51987654321")).isTrue();
        assertThat(Validators.isE164("987654321")).isFalse();
        assertThat(Validators.normalizePhone("+51 987-654 321")).isEqualTo("+51987654321");
    }

    @Test
    void masksAllButLastFour() {
        assertThat(Validators.mask("45879632")).isEqualTo("****9632");
        assertThat(Validators.mask("12")).isEqualTo("12");
        assertThat(Validators.mask(null)).isNull();
    }
}
