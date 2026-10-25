package com.pmd.goldpassport.relationships.internal;

import java.time.Instant;
import java.util.UUID;

import com.pmd.goldpassport.shared.IdDocumentType;
import com.pmd.goldpassport.shared.InvalidStateException;
import com.pmd.goldpassport.shared.Role;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

/** A commercial relationship registered by a Transporter or a Collector/Plant. */
@Entity
@Table(name = "relationships", schema = "relationships")
public class Relationship {

    @Id
    private UUID id;

    private UUID ownerUserId;

    @Enumerated(EnumType.STRING)
    private Role ownerRole;

    @Enumerated(EnumType.STRING)
    private Role counterpartyRole;

    private UUID counterpartyUserId;

    private String entityName;

    @Enumerated(EnumType.STRING)
    private IdDocumentType documentType;

    private String documentNumber;

    private String phone;

    private String contactPerson;

    @Enumerated(EnumType.STRING)
    private RelationshipStatus status;

    private String reviewNotes;

    private UUID reviewerId;

    private Instant createdAt;

    private Instant updatedAt;

    @Version
    private Long version;

    protected Relationship() {
    }

    public static Relationship register(UUID ownerUserId, Role ownerRole, Role counterpartyRole, Details details,
            UUID counterpartyUserId, RelationshipStatus initialStatus, Instant now) {
        Relationship r = new Relationship();
        r.id = UUID.randomUUID();
        r.ownerUserId = ownerUserId;
        r.ownerRole = ownerRole;
        r.counterpartyRole = counterpartyRole;
        r.apply(details);
        r.counterpartyUserId = counterpartyUserId;
        r.status = initialStatus;
        r.createdAt = now;
        r.updatedAt = now;
        return r;
    }

    public void resubmit(Details details, UUID counterpartyUserId, Instant now) {
        if (status != RelationshipStatus.CLARIFICATION_REQUESTED) {
            throw InvalidStateException.of("Relationship", status, "resubmit");
        }
        apply(details);
        this.counterpartyUserId = counterpartyUserId;
        status = RelationshipStatus.PENDING_REVIEW;
        updatedAt = now;
    }

    public void approve(UUID reviewer, String notes, Instant now) {
        transition(RelationshipStatus.PENDING_REVIEW, RelationshipStatus.APPROVED, reviewer, notes, now, "approve");
    }

    public void requestClarification(UUID reviewer, String notes, Instant now) {
        transition(RelationshipStatus.PENDING_REVIEW, RelationshipStatus.CLARIFICATION_REQUESTED, reviewer, notes, now,
                "request clarification");
    }

    public void reject(UUID reviewer, String notes, Instant now) {
        if (status != RelationshipStatus.PENDING_REVIEW && status != RelationshipStatus.CLARIFICATION_REQUESTED) {
            throw InvalidStateException.of("Relationship", status, "reject");
        }
        status = RelationshipStatus.REJECTED;
        reviewerId = reviewer;
        reviewNotes = notes;
        updatedAt = now;
    }

    public void linkCounterparty(UUID userId) {
        this.counterpartyUserId = userId;
    }

    private void transition(RelationshipStatus from, RelationshipStatus to, UUID reviewer, String notes, Instant now,
            String action) {
        if (status != from) {
            throw InvalidStateException.of("Relationship", status, action);
        }
        status = to;
        reviewerId = reviewer;
        reviewNotes = notes;
        updatedAt = now;
    }

    private void apply(Details d) {
        this.entityName = d.entityName();
        this.documentType = d.documentType();
        this.documentNumber = d.documentNumber();
        this.phone = d.phone();
        this.contactPerson = d.contactPerson();
    }

    /** Entity details as entered by the owner. */
    public record Details(String entityName, IdDocumentType documentType, String documentNumber, String phone,
            String contactPerson) {
    }

    public UUID getId() {
        return id;
    }

    public UUID getOwnerUserId() {
        return ownerUserId;
    }

    public Role getOwnerRole() {
        return ownerRole;
    }

    public Role getCounterpartyRole() {
        return counterpartyRole;
    }

    public UUID getCounterpartyUserId() {
        return counterpartyUserId;
    }

    public String getEntityName() {
        return entityName;
    }

    public IdDocumentType getDocumentType() {
        return documentType;
    }

    public String getDocumentNumber() {
        return documentNumber;
    }

    public String getPhone() {
        return phone;
    }

    public String getContactPerson() {
        return contactPerson;
    }

    public RelationshipStatus getStatus() {
        return status;
    }

    public String getReviewNotes() {
        return reviewNotes;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
