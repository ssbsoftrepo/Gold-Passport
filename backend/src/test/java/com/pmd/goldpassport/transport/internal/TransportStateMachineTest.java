package com.pmd.goldpassport.transport.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.pmd.goldpassport.shared.GeoPoint;
import com.pmd.goldpassport.shared.InvalidStateException;

class TransportStateMachineTest {

    private final Instant now = Instant.parse("2026-10-21T10:00:00Z");

    private Transport requested() {
        return Transport.request("TR-TEST0001", UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), null, null, now);
    }

    private TransportCheckpoint cp(CheckpointType type) {
        return TransportCheckpoint.of(type, new GeoPoint(-14.83, -74.93), 5.0, now, now);
    }

    @Test
    void confirmedOnlyWhenBothPartiesConfirm() {
        Transport t = requested();
        t.minerConfirm(UUID.randomUUID(), "GP-TEST0001", now);
        assertThat(t.confirmIfComplete(now)).isFalse();
        t.collectorConfirm(now);
        assertThat(t.confirmIfComplete(now)).isTrue();
        assertThat(t.getStatus()).isEqualTo(TransportStatus.CONFIRMED);
    }

    @Test
    void declineClearsConfirmationsAndAmendReopens() {
        Transport t = requested();
        t.minerConfirm(UUID.randomUUID(), "GP-TEST0001", now);
        t.decline(t.getCollectorUserId(), "No capacity", now);
        assertThat(t.getStatus()).isEqualTo(TransportStatus.DECLINED);
        assertThat(t.getLotId()).isNull();
        assertThat(t.getMinerConfirmedAt()).isNull();
        t.amend(t.getMinerUserId(), t.getCollectorUserId(), null, "new date", now);
        assertThat(t.getStatus()).isEqualTo(TransportStatus.PENDING_CONFIRMATION);
    }

    @Test
    void pickupRequiresApprovalAndHandover() {
        Transport t = requested();
        t.minerConfirm(UUID.randomUUID(), "GP-TEST0001", now);
        t.collectorConfirm(now);
        t.confirmIfComplete(now);
        t.depart(cp(CheckpointType.DEPARTED), now);
        t.arriveAtMiner(cp(CheckpointType.ARRIVED_AT_MINER), 0.1, false, now);
        assertThatThrownBy(() -> t.pickUp(cp(CheckpointType.PICKED_UP), now)).isInstanceOf(InvalidStateException.class);
        t.approvePickup(now);
        t.confirmHandover(now);
        t.pickUp(cp(CheckpointType.PICKED_UP), now);
        assertThat(t.getStatus()).isEqualTo(TransportStatus.IN_TRANSIT);
        assertThatThrownBy(() -> t.cancel("too late", now)).isInstanceOf(InvalidStateException.class);
    }

    @Test
    void cannotSkipSteps() {
        Transport t = requested();
        assertThatThrownBy(() -> t.depart(cp(CheckpointType.DEPARTED), now)).isInstanceOf(InvalidStateException.class);
        assertThatThrownBy(() -> t.receive(now)).isInstanceOf(InvalidStateException.class);
        assertThatThrownBy(() -> t.close(now)).isInstanceOf(InvalidStateException.class);
    }
}
