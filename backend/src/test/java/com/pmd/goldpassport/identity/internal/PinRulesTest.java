package com.pmd.goldpassport.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.pmd.goldpassport.shared.Role;

class PinRulesTest {

    @ParameterizedTest
    @ValueSource(strings = {"135790", "482915", "102938", "000001", "998877"})
    void acceptsSixDigitPins(String pin) {
        assertThat(PinRules.isValidPin(pin)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"123456", "234567", "987654", "012345", "000000", "999999", "12345", "1234567", "12a456", " 13579", ""})
    void refusesRunsRepeatsAndOtherShapes(String pin) {
        assertThat(PinRules.isValidPin(pin)).isFalse();
    }

    @Test
    void staffNeedTenCharacters() {
        assertThat(PinRules.isAllowed("135790", Role.ADMIN)).isFalse();
        assertThat(PinRules.isAllowed("oro-seguro", Role.ADMIN)).isTrue();
        assertThat(PinRules.isAllowed("135790", Role.MINER)).isTrue();
        assertThat(PinRules.isAllowed("135790", null)).isTrue();
    }

    @Test
    void temporarySecretsFollowTheRulesOfTheRole() {
        for (int i = 0; i < 200; i++) {
            assertThat(PinRules.isValidPin(LocalPinService.temporaryFor(Role.MINER))).isTrue();
            assertThat(PinRules.isAllowed(LocalPinService.temporaryFor(Role.ADMIN), Role.ADMIN)).isTrue();
        }
    }
}
