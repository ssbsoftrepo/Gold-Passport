package com.pmd.goldpassport.settlement.internal;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.lab.LabQueries;
import com.pmd.goldpassport.lots.LotCustody;
import com.pmd.goldpassport.lots.LotView;
import com.pmd.goldpassport.settlement.SettlementEvent;
import com.pmd.goldpassport.shared.BadRequestException;
import com.pmd.goldpassport.shared.ForbiddenException;
import com.pmd.goldpassport.shared.InvalidStateException;
import com.pmd.goldpassport.shared.NotFoundException;
import com.pmd.goldpassport.shared.Role;
import com.pmd.goldpassport.shared.Validators;

/**
 * Payment agreement: Collector proposes, Miner accepts or disputes, PMD validates, Collector pays
 * outside the app and records the payment reference, which completes the operation.
 */
@Service
public class SettlementService {

    private static final Set<String> CURRENCIES = Set.of("PEN", "USD");

    private final SettlementRepository settlements;
    private final LotCustody lots;
    private final LabQueries lab;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public SettlementService(SettlementRepository settlements, LotCustody lots, LabQueries lab,
            ApplicationEventPublisher events, Clock clock) {
        this.settlements = settlements;
        this.lots = lots;
        this.lab = lab;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public Settlement propose(CurrentUser me, UUID lotId, BigDecimal amount, String currency, BigDecimal pricePerGram,
            String notes) {
        me.requireRole(Role.COLLECTOR);
        LotView lot = lots.get(lotId);
        if (!me.userId().equals(lot.collectorUserId())) {
            throw new ForbiddenException("NOT_A_PARTICIPANT", "Only the receiving Collector/Plant can propose the payment");
        }
        if (lab.verifiedAssay(lotId).isEmpty()) {
            throw new InvalidStateException("LAB_NOT_VERIFIED", "The laboratory result must be approved before proposing a payment");
        }
        if (amount == null || amount.signum() <= 0) {
            throw new BadRequestException("INVALID_AMOUNT", "Amount must be greater than 0");
        }
        if (currency == null || !CURRENCIES.contains(currency)) {
            throw new BadRequestException("INVALID_CURRENCY", "Currency must be PEN or USD");
        }
        Instant now = Instant.now(clock);
        Settlement s = settlements.findByLotId(lotId)
                .orElseGet(() -> Settlement.open(lotId, lot.code(), lot.minerUserId(), me.userId(), now));
        s.propose(amount, currency, pricePerGram, blankToNull(notes), me.userId(), now);
        s = settlements.save(s);
        Map<String, Object> details = new HashMap<>();
        details.put("amount", amount);
        details.put("currency", currency);
        if (pricePerGram != null) {
            details.put("pricePerGram", pricePerGram);
        }
        details.put("proposalNumber", s.getProposals().size());
        publish(SettlementEvent.Kind.PROPOSED, s, me, details, now);
        return s;
    }

    @Transactional
    public Settlement accept(CurrentUser me, UUID lotId) {
        Settlement s = asMiner(me, lotId);
        Instant now = Instant.now(clock);
        s.accept(now);
        publish(SettlementEvent.Kind.ACCEPTED, s, me, Map.of("amount", s.getAmount(), "currency", s.getCurrency()), now);
        return s;
    }

    @Transactional
    public Settlement dispute(CurrentUser me, UUID lotId, String reason) {
        Settlement s = asMiner(me, lotId);
        if (Validators.isBlank(reason)) {
            throw new BadRequestException("REASON_REQUIRED", "Explain why you dispute the amount");
        }
        Instant now = Instant.now(clock);
        s.dispute(reason.trim(), now);
        publish(SettlementEvent.Kind.DISPUTED, s, me, Map.of("reason", reason.trim()), now);
        return s;
    }

    @Transactional
    public Settlement validate(CurrentUser admin, UUID lotId, String notes) {
        admin.requireRole(Role.ADMIN);
        Settlement s = byLot(lotId);
        Instant now = Instant.now(clock);
        s.validate(admin.userId(), blankToNull(notes), now);
        publish(SettlementEvent.Kind.VALIDATED, s, admin, Map.of("amount", s.getAmount(), "currency", s.getCurrency()), now);
        return s;
    }

    @Transactional
    public Settlement reject(CurrentUser admin, UUID lotId, String reason) {
        admin.requireRole(Role.ADMIN);
        if (Validators.isBlank(reason)) {
            throw new BadRequestException("REASON_REQUIRED", "Explain why the amount is not validated");
        }
        Settlement s = byLot(lotId);
        Instant now = Instant.now(clock);
        s.rejectByAdmin(admin.userId(), reason.trim(), now);
        publish(SettlementEvent.Kind.REJECTED_BY_PMD, s, admin, Map.of("reason", reason.trim()), now);
        return s;
    }

    @Transactional
    public Settlement markPaid(CurrentUser me, UUID lotId, String reference, PaymentMethod method, String notes) {
        me.requireRole(Role.COLLECTOR);
        Settlement s = byLot(lotId);
        if (!me.userId().equals(s.getCollectorUserId())) {
            throw new ForbiddenException("NOT_A_PARTICIPANT", "Only the paying Collector/Plant can record the payment");
        }
        if (Validators.isBlank(reference) || method == null) {
            throw new BadRequestException("PAYMENT_DETAILS_REQUIRED", "Payment reference and method are required");
        }
        Instant now = Instant.now(clock);
        s.markPaid(reference.trim(), method, blankToNull(notes), now);
        lots.markSettled(lotId, me);
        publish(SettlementEvent.Kind.PAID, s, me, Map.of(
                "amount", s.getAmount(),
                "currency", s.getCurrency(),
                "paymentMethod", method.name(),
                "paymentReference", reference.trim()), now);
        return s;
    }

    @Transactional(readOnly = true)
    public Settlement get(CurrentUser me, UUID lotId) {
        lots.requireReadable(lotId, me);
        return byLot(lotId);
    }

    @Transactional(readOnly = true)
    public List<Settlement> listFor(CurrentUser me) {
        return settlements.findForParticipant(me.userId());
    }

    @Transactional(readOnly = true)
    public List<Settlement> list(SettlementStatus status) {
        return status == null ? settlements.findAllByOrderByUpdatedAtDesc()
                : settlements.findByStatusOrderByUpdatedAtAsc(status);
    }

    private Settlement asMiner(CurrentUser me, UUID lotId) {
        me.requireRole(Role.MINER);
        Settlement s = byLot(lotId);
        if (!me.userId().equals(s.getMinerUserId())) {
            throw new ForbiddenException("NOT_A_PARTICIPANT", "This settlement belongs to another miner");
        }
        return s;
    }

    private Settlement byLot(UUID lotId) {
        return settlements.findByLotId(lotId).orElseThrow(() -> new NotFoundException("Settlement for lot", lotId));
    }

    private void publish(SettlementEvent.Kind kind, Settlement s, CurrentUser actor, Map<String, Object> details,
            Instant now) {
        events.publishEvent(new SettlementEvent(kind, s.getId(), s.getLotId(), s.getLotCode(), s.getMinerUserId(),
                s.getCollectorUserId(), actor.userId(), actor.roleName(), details, now));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
