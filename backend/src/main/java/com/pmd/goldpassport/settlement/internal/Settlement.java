package com.pmd.goldpassport.settlement.internal;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.pmd.goldpassport.shared.InvalidStateException;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

/**
 * Payment agreement for a lot. The money moves outside the app (bank transfer or cash); the
 * platform records the agreed amount, PMD's validation and the payment reference.
 */
@Entity
@Table(name = "settlements", schema = "settlement")
public class Settlement {

    @Id
    private UUID id;

    private UUID lotId;

    private String lotCode;

    private UUID minerUserId;

    private UUID collectorUserId;

    @Enumerated(EnumType.STRING)
    private SettlementStatus status;

    private BigDecimal amount;

    private String currency;

    private String adminNotes;

    private UUID validatedBy;

    private Instant validatedAt;

    private String paymentReference;

    @Enumerated(EnumType.STRING)
    private PaymentMethod paymentMethod;

    private String paymentNotes;

    private Instant paidAt;

    private Instant createdAt;

    private Instant updatedAt;

    @Version
    private Long version;

    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @JoinColumn(name = "settlement_id", nullable = false)
    @OrderBy("proposedAt ASC")
    private List<SettlementProposal> proposals = new ArrayList<>();

    protected Settlement() {
    }

    public static Settlement open(UUID lotId, String lotCode, UUID minerUserId, UUID collectorUserId, Instant now) {
        Settlement s = new Settlement();
        s.id = UUID.randomUUID();
        s.lotId = lotId;
        s.lotCode = lotCode;
        s.minerUserId = minerUserId;
        s.collectorUserId = collectorUserId;
        s.createdAt = now;
        s.updatedAt = now;
        return s;
    }

    /** First proposal, revision before the miner answers, or a new offer after a dispute. */
    public void propose(BigDecimal amount, String currency, BigDecimal pricePerGram, String notes, UUID collector,
            Instant now) {
        if (status != null && status != SettlementStatus.PROPOSED && status != SettlementStatus.DISPUTED) {
            throw InvalidStateException.of("Settlement", status, "propose amount");
        }
        proposals.add(SettlementProposal.of(amount, currency, pricePerGram, notes, collector, now));
        this.amount = amount;
        this.currency = currency;
        status = SettlementStatus.PROPOSED;
        updatedAt = now;
    }

    public void accept(Instant now) {
        require(SettlementStatus.PROPOSED, "accept");
        current().answer(SettlementProposal.ACCEPTED, null, now);
        status = SettlementStatus.MINER_ACCEPTED;
        updatedAt = now;
    }

    public void dispute(String reason, Instant now) {
        require(SettlementStatus.PROPOSED, "dispute");
        current().answer(SettlementProposal.DISPUTED, reason, now);
        status = SettlementStatus.DISPUTED;
        updatedAt = now;
    }

    public void validate(UUID admin, String notes, Instant now) {
        require(SettlementStatus.MINER_ACCEPTED, "validate");
        validatedBy = admin;
        validatedAt = now;
        adminNotes = notes;
        status = SettlementStatus.AGREED;
        updatedAt = now;
    }

    public void rejectByAdmin(UUID admin, String reason, Instant now) {
        require(SettlementStatus.MINER_ACCEPTED, "reject");
        current().answer(SettlementProposal.ADMIN_REJECTED, reason, now);
        adminNotes = reason;
        status = SettlementStatus.DISPUTED;
        updatedAt = now;
    }

    public void markPaid(String reference, PaymentMethod method, String notes, Instant now) {
        require(SettlementStatus.AGREED, "mark paid");
        paymentReference = reference;
        paymentMethod = method;
        paymentNotes = notes;
        paidAt = now;
        status = SettlementStatus.PAID;
        updatedAt = now;
    }

    private SettlementProposal current() {
        return proposals.get(proposals.size() - 1);
    }

    private void require(SettlementStatus expected, String action) {
        if (status != expected) {
            throw InvalidStateException.of("Settlement", status, action);
        }
    }

    public UUID getId() {
        return id;
    }

    public UUID getLotId() {
        return lotId;
    }

    public String getLotCode() {
        return lotCode;
    }

    public UUID getMinerUserId() {
        return minerUserId;
    }

    public UUID getCollectorUserId() {
        return collectorUserId;
    }

    public SettlementStatus getStatus() {
        return status;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public String getCurrency() {
        return currency;
    }

    public String getAdminNotes() {
        return adminNotes;
    }

    public String getPaymentReference() {
        return paymentReference;
    }

    public PaymentMethod getPaymentMethod() {
        return paymentMethod;
    }

    public Instant getPaidAt() {
        return paidAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public List<SettlementProposal> getProposals() {
        return proposals;
    }
}
