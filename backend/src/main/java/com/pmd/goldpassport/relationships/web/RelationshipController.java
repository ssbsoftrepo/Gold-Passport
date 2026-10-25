package com.pmd.goldpassport.relationships.web;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.identity.UserAccounts;
import com.pmd.goldpassport.relationships.internal.Relationship;
import com.pmd.goldpassport.relationships.internal.RelationshipService;
import com.pmd.goldpassport.relationships.internal.RelationshipStatus;
import com.pmd.goldpassport.shared.IdDocumentType;
import com.pmd.goldpassport.shared.Role;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@RestController
class RelationshipController {

    private final RelationshipService relationships;
    private final UserAccounts users;

    RelationshipController(RelationshipService relationships, UserAccounts users) {
        this.relationships = relationships;
        this.users = users;
    }

    record RelationshipRequest(
            @NotNull Role counterpartyRole,
            UUID counterpartyUserId,
            @Size(max = 200) String entityName,
            IdDocumentType documentType,
            @Size(max = 20) String documentNumber,
            @Size(max = 20) String phone,
            @Size(max = 200) String contactPerson) {

        RelationshipService.Command toCommand() {
            return new RelationshipService.Command(counterpartyRole, counterpartyUserId, entityName, documentType,
                    documentNumber, phone, contactPerson);
        }
    }

    record ReviewDecisionRequest(@Size(max = 2000) String notes) {
    }

    record CommercialRelationship(UUID id, UUID ownerUserId, Role ownerRole, String ownerName, Role counterpartyRole,
            UUID counterpartyUserId, String entityName, IdDocumentType documentType, String documentNumber,
            String phone, String contactPerson, RelationshipStatus status, String reviewNotes, Instant createdAt,
            Instant updatedAt) {
    }

    @GetMapping("/api/v1/relationships")
    List<CommercialRelationship> mine(CurrentUser me) {
        return toDtos(relationships.visibleTo(me));
    }

    @PostMapping("/api/v1/relationships")
    @ResponseStatus(HttpStatus.CREATED)
    CommercialRelationship create(CurrentUser me, @Valid @RequestBody RelationshipRequest body) {
        return toDto(relationships.create(me, body.toCommand()));
    }

    @PutMapping("/api/v1/relationships/{relationshipId}")
    CommercialRelationship resubmit(CurrentUser me, @PathVariable UUID relationshipId,
            @Valid @RequestBody RelationshipRequest body) {
        return toDto(relationships.resubmit(me, relationshipId, body.toCommand()));
    }

    @GetMapping("/api/v1/admin/relationships")
    List<CommercialRelationship> adminList(@RequestParam(required = false) RelationshipStatus status) {
        return toDtos(relationships.list(status));
    }

    @PostMapping("/api/v1/admin/relationships/{relationshipId}/approve")
    CommercialRelationship approve(CurrentUser me, @PathVariable UUID relationshipId,
            @Valid @RequestBody ReviewDecisionRequest body) {
        return toDto(relationships.approve(me, relationshipId, body.notes()));
    }

    @PostMapping("/api/v1/admin/relationships/{relationshipId}/request-clarification")
    CommercialRelationship requestClarification(CurrentUser me, @PathVariable UUID relationshipId,
            @Valid @RequestBody ReviewDecisionRequest body) {
        return toDto(relationships.requestClarification(me, relationshipId, body.notes()));
    }

    @PostMapping("/api/v1/admin/relationships/{relationshipId}/reject")
    CommercialRelationship reject(CurrentUser me, @PathVariable UUID relationshipId,
            @Valid @RequestBody ReviewDecisionRequest body) {
        return toDto(relationships.reject(me, relationshipId, body.notes()));
    }

    private CommercialRelationship toDto(Relationship r) {
        return toDtos(List.of(r)).get(0);
    }

    private List<CommercialRelationship> toDtos(Collection<Relationship> list) {
        Map<UUID, String> names = users.displayNames(list.stream().map(Relationship::getOwnerUserId).toList());
        return list.stream().map(r -> new CommercialRelationship(r.getId(), r.getOwnerUserId(), r.getOwnerRole(),
                names.get(r.getOwnerUserId()), r.getCounterpartyRole(), r.getCounterpartyUserId(), r.getEntityName(),
                r.getDocumentType(), r.getDocumentNumber(), r.getPhone(), r.getContactPerson(), r.getStatus(),
                r.getReviewNotes(), r.getCreatedAt(), r.getUpdatedAt())).toList();
    }
}
