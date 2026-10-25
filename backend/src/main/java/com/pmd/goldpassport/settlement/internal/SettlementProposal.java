package com.pmd.goldpassport.settlement.internal;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One amount proposed by the Collector and how it was answered. Kept for the negotiation history. */
@Entity
@Table(name = "proposals", schema = "settlement")
public class SettlementProposal {

    public static final String ACCEPTED = "ACCEPTED";
    public static final String DISPUTED = "DISPUTED";
    public static final String ADMIN_REJECTED = "ADMIN_REJECTED";

    @Id
    private UUID id;

    private BigDecimal amount;

    private String currency;

    private BigDecimal pricePerGram;

    private String notes;

    private UUID proposedBy;

    private Instant proposedAt;

    private String response;

    private String responseReason;

    private Instant respondedAt;

    protected SettlementProposal() {
    }

    static SettlementProposal of(BigDecimal amount, String currency, BigDecimal pricePerGram, String notes,
            UUID proposedBy, Instant now) {
        SettlementProposal p = new SettlementProposal();
        p.id = UUID.randomUUID();
        p.amount = amount;
        p.currency = currency;
        p.pricePerGram = pricePerGram;
        p.notes = notes;
        p.proposedBy = proposedBy;
        p.proposedAt = now;
        return p;
    }

    void answer(String response, String reason, Instant now) {
        this.response = response;
        this.responseReason = reason;
        this.respondedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public String getCurrency() {
        return currency;
    }

    public BigDecimal getPricePerGram() {
        return pricePerGram;
    }

    public String getNotes() {
        return notes;
    }

    public Instant getProposedAt() {
        return proposedAt;
    }

    public String getResponse() {
        return response;
    }

    public String getResponseReason() {
        return responseReason;
    }

    public Instant getRespondedAt() {
        return respondedAt;
    }
}
