package com.pmd.goldpassport.settlement.web;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.settlement.internal.PaymentMethod;
import com.pmd.goldpassport.settlement.internal.Settlement;
import com.pmd.goldpassport.settlement.internal.SettlementProposal;
import com.pmd.goldpassport.settlement.internal.SettlementService;
import com.pmd.goldpassport.settlement.internal.SettlementStatus;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@RestController
class SettlementController {

    private final SettlementService settlements;

    SettlementController(SettlementService settlements) {
        this.settlements = settlements;
    }

    record ProposeAmountRequest(@NotNull @DecimalMin(value = "0", inclusive = false) BigDecimal amount,
            @NotNull @Pattern(regexp = "PEN|USD") String currency, BigDecimal pricePerGram,
            @Size(max = 2000) String notes) {
    }

    record ReasonRequest(@NotBlank @Size(max = 2000) String reason) {
    }

    record ReviewDecisionRequest(@Size(max = 2000) String notes) {
    }

    record MarkPaidRequest(@NotBlank @Size(max = 100) String paymentReference, @NotNull PaymentMethod paymentMethod,
            @Size(max = 2000) String notes) {
    }

    record ProposalDto(UUID id, BigDecimal amount, String currency, BigDecimal pricePerGram, String notes,
            Instant proposedAt, String response, String responseReason, Instant respondedAt) {

        static ProposalDto of(SettlementProposal p) {
            return new ProposalDto(p.getId(), p.getAmount(), p.getCurrency(), p.getPricePerGram(), p.getNotes(),
                    p.getProposedAt(), p.getResponse(), p.getResponseReason(), p.getRespondedAt());
        }
    }

    record SettlementDto(UUID id, UUID lotId, String lotCode, UUID minerUserId, UUID collectorUserId,
            SettlementStatus status, BigDecimal amount, String currency, String adminNotes, String paymentReference,
            PaymentMethod paymentMethod, Instant paidAt, List<ProposalDto> proposals, Instant createdAt,
            Instant updatedAt) {

        static SettlementDto of(Settlement s) {
            return new SettlementDto(s.getId(), s.getLotId(), s.getLotCode(), s.getMinerUserId(), s.getCollectorUserId(),
                    s.getStatus(), s.getAmount(), s.getCurrency(), s.getAdminNotes(), s.getPaymentReference(),
                    s.getPaymentMethod(), s.getPaidAt(), s.getProposals().stream().map(ProposalDto::of).toList(),
                    s.getCreatedAt(), s.getUpdatedAt());
        }
    }

    @GetMapping("/api/v1/settlements")
    List<SettlementDto> mine(CurrentUser me) {
        return settlements.listFor(me).stream().map(SettlementDto::of).toList();
    }

    @GetMapping("/api/v1/lots/{lotId}/settlement")
    SettlementDto get(CurrentUser me, @PathVariable UUID lotId) {
        return SettlementDto.of(settlements.get(me, lotId));
    }

    @PostMapping("/api/v1/lots/{lotId}/settlement/proposals")
    SettlementDto propose(CurrentUser me, @PathVariable UUID lotId, @Valid @RequestBody ProposeAmountRequest body) {
        return SettlementDto.of(settlements.propose(me, lotId, body.amount(), body.currency(), body.pricePerGram(),
                body.notes()));
    }

    @PostMapping("/api/v1/lots/{lotId}/settlement/accept")
    SettlementDto accept(CurrentUser me, @PathVariable UUID lotId) {
        return SettlementDto.of(settlements.accept(me, lotId));
    }

    @PostMapping("/api/v1/lots/{lotId}/settlement/dispute")
    SettlementDto dispute(CurrentUser me, @PathVariable UUID lotId, @Valid @RequestBody ReasonRequest body) {
        return SettlementDto.of(settlements.dispute(me, lotId, body.reason()));
    }

    @PostMapping("/api/v1/lots/{lotId}/settlement/mark-paid")
    SettlementDto markPaid(CurrentUser me, @PathVariable UUID lotId, @Valid @RequestBody MarkPaidRequest body) {
        return SettlementDto.of(settlements.markPaid(me, lotId, body.paymentReference(), body.paymentMethod(),
                body.notes()));
    }

    @GetMapping("/api/v1/admin/settlements")
    List<SettlementDto> adminList(@RequestParam(required = false) SettlementStatus status) {
        return settlements.list(status).stream().map(SettlementDto::of).toList();
    }

    @PostMapping("/api/v1/admin/lots/{lotId}/settlement/validate")
    SettlementDto validate(CurrentUser me, @PathVariable UUID lotId, @Valid @RequestBody ReviewDecisionRequest body) {
        return SettlementDto.of(settlements.validate(me, lotId, body.notes()));
    }

    @PostMapping("/api/v1/admin/lots/{lotId}/settlement/reject")
    SettlementDto reject(CurrentUser me, @PathVariable UUID lotId, @Valid @RequestBody ReasonRequest body) {
        return SettlementDto.of(settlements.reject(me, lotId, body.reason()));
    }
}
