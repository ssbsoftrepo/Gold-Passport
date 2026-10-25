package com.pmd.goldpassport.settlement.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.pmd.goldpassport.shared.InvalidStateException;

class SettlementStateMachineTest {

    private final Instant now = Instant.parse("2026-10-21T10:00:00Z");
    private final UUID collector = UUID.randomUUID();

    private Settlement proposed(String amount) {
        Settlement s = Settlement.open(UUID.randomUUID(), "GP-TEST0001", UUID.randomUUID(), collector, now);
        s.propose(new BigDecimal(amount), "PEN", null, null, collector, now);
        return s;
    }

    @Test
    void happyPath() {
        Settlement s = proposed("30000");
        s.accept(now);
        s.validate(UUID.randomUUID(), "ok", now);
        s.markPaid("OP-1", PaymentMethod.BANK_TRANSFER, null, now);
        assertThat(s.getStatus()).isEqualTo(SettlementStatus.PAID);
        assertThat(s.getProposals().get(0).getResponse()).isEqualTo(SettlementProposal.ACCEPTED);
    }

    @Test
    void disputeThenNewProposal() {
        Settlement s = proposed("30000");
        s.dispute("too low", now);
        assertThat(s.getStatus()).isEqualTo(SettlementStatus.DISPUTED);
        s.propose(new BigDecimal("31000"), "PEN", null, null, collector, now);
        assertThat(s.getStatus()).isEqualTo(SettlementStatus.PROPOSED);
        assertThat(s.getAmount()).isEqualByComparingTo("31000");
        assertThat(s.getProposals()).hasSize(2);
    }

    @Test
    void adminRejectionReopensNegotiation() {
        Settlement s = proposed("30000");
        s.accept(now);
        s.rejectByAdmin(UUID.randomUUID(), "Price far below market", now);
        assertThat(s.getStatus()).isEqualTo(SettlementStatus.DISPUTED);
    }

    @Test
    void cannotPayBeforeValidation() {
        Settlement s = proposed("30000");
        s.accept(now);
        assertThatThrownBy(() -> s.markPaid("OP-1", PaymentMethod.CASH, null, now))
                .isInstanceOf(InvalidStateException.class);
    }
}
