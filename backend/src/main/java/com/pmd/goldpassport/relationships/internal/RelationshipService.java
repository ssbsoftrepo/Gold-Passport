package com.pmd.goldpassport.relationships.internal;

import java.time.Clock;
import java.time.Instant;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.onboarding.ParticipantDirectory;
import com.pmd.goldpassport.onboarding.ParticipantSummary;
import com.pmd.goldpassport.relationships.RelationshipEvent;
import com.pmd.goldpassport.relationships.RelationshipQueries;
import com.pmd.goldpassport.shared.BadRequestException;
import com.pmd.goldpassport.shared.BusinessRuleException;
import com.pmd.goldpassport.shared.ForbiddenException;
import com.pmd.goldpassport.shared.IdDocumentType;
import com.pmd.goldpassport.shared.InvalidStateException;
import com.pmd.goldpassport.shared.NotFoundException;
import com.pmd.goldpassport.shared.Role;
import com.pmd.goldpassport.shared.Validators;

/**
 * Commercial relationships.
 * <ul>
 *   <li>Transporters register the Miners and Collectors they work with by entering their details;
 *       PMD validates each one (request clarification / reject / approve).</li>
 *   <li>Collectors pick already-approved Miners and Transporters from the directory; these are
 *       approved immediately because both sides are KYC-verified.</li>
 * </ul>
 */
@Service
public class RelationshipService implements RelationshipQueries {

    private static final Map<Role, Set<Role>> ALLOWED = Map.of(
            Role.TRANSPORTER, EnumSet.of(Role.MINER, Role.COLLECTOR),
            Role.COLLECTOR, EnumSet.of(Role.MINER, Role.TRANSPORTER));

    private final RelationshipRepository relationships;
    private final ParticipantDirectory participants;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public RelationshipService(RelationshipRepository relationships, ParticipantDirectory participants,
            ApplicationEventPublisher events, Clock clock) {
        this.relationships = relationships;
        this.participants = participants;
        this.events = events;
        this.clock = clock;
    }

    public record Command(Role counterpartyRole, UUID counterpartyUserId, String entityName,
            IdDocumentType documentType, String documentNumber, String phone, String contactPerson) {
    }

    @Transactional
    public Relationship create(CurrentUser me, Command cmd) {
        participants.requireApproved(me);
        Set<Role> allowed = me.role() == null ? Set.of() : ALLOWED.getOrDefault(me.role(), Set.of());
        if (allowed.isEmpty()) {
            throw new ForbiddenException("ROLE_REQUIRED", "Only Transporters and Collectors register relationships");
        }
        if (cmd.counterpartyRole() == null || !allowed.contains(cmd.counterpartyRole())) {
            throw new BadRequestException("COUNTERPARTY_ROLE_NOT_ALLOWED",
                    me.role() + " can register relationships with " + allowed);
        }
        Resolved resolved = resolve(me, cmd);
        if (relationships.existsByOwnerUserIdAndCounterpartyRoleAndDocumentNumberAndStatusIn(me.userId(),
                cmd.counterpartyRole(), resolved.details().documentNumber(),
                EnumSet.of(RelationshipStatus.PENDING_REVIEW, RelationshipStatus.CLARIFICATION_REQUESTED,
                        RelationshipStatus.APPROVED))) {
            throw new InvalidStateException("RELATIONSHIP_EXISTS", "This relationship is already registered");
        }
        RelationshipStatus initial = me.role() == Role.COLLECTOR ? RelationshipStatus.APPROVED : RelationshipStatus.PENDING_REVIEW;
        Instant now = Instant.now(clock);
        Relationship r = relationships.save(Relationship.register(me.userId(), me.role(), cmd.counterpartyRole(),
                resolved.details(), resolved.counterpartyUserId(), initial, now));
        publish(initial == RelationshipStatus.APPROVED ? RelationshipEvent.Kind.APPROVED : RelationshipEvent.Kind.SUBMITTED,
                r, me, Map.of("counterpartyRole", r.getCounterpartyRole().name()), now);
        return r;
    }

    @Transactional
    public Relationship resubmit(CurrentUser me, UUID id, Command cmd) {
        Relationship r = get(id);
        if (!r.getOwnerUserId().equals(me.userId())) {
            throw new ForbiddenException("NOT_OWNER", "Only the owner can update this relationship");
        }
        if (cmd.counterpartyRole() != r.getCounterpartyRole()) {
            throw new BadRequestException("COUNTERPARTY_ROLE_IMMUTABLE", "The counterparty role cannot change");
        }
        Resolved resolved = resolve(me, cmd);
        Instant now = Instant.now(clock);
        r.resubmit(resolved.details(), resolved.counterpartyUserId(), now);
        publish(RelationshipEvent.Kind.SUBMITTED, r, me, Map.of("resubmission", true), now);
        return r;
    }

    @Transactional(readOnly = true)
    public List<Relationship> visibleTo(CurrentUser me) {
        return relationships.findVisibleTo(me.userId());
    }

    // ---------------------------------------------------------------- back office

    @Transactional(readOnly = true)
    public List<Relationship> list(RelationshipStatus status) {
        return status == null ? relationships.findAllByOrderByUpdatedAtDesc()
                : relationships.findByStatusOrderByCreatedAtAsc(status);
    }

    @Transactional
    public Relationship approve(CurrentUser admin, UUID id, String notes) {
        Relationship r = get(id);
        if (r.getCounterpartyUserId() == null) {
            // The entity may have joined the platform since the relationship was registered.
            participants.findApprovedByDocument(r.getCounterpartyRole(), r.getDocumentNumber())
                    .ifPresent(p -> r.linkCounterparty(p.userId()));
        }
        if (r.getCounterpartyUserId() == null) {
            throw new BusinessRuleException("COUNTERPARTY_NOT_ON_PLATFORM",
                    "The " + r.getCounterpartyRole() + " with document " + r.getDocumentNumber()
                            + " is not an approved PMD participant yet");
        }
        Instant now = Instant.now(clock);
        r.approve(admin.userId(), notes, now);
        publish(RelationshipEvent.Kind.APPROVED, r, admin, notes(notes), now);
        return r;
    }

    @Transactional
    public Relationship requestClarification(CurrentUser admin, UUID id, String notes) {
        requireNotes(notes);
        Relationship r = get(id);
        Instant now = Instant.now(clock);
        r.requestClarification(admin.userId(), notes, now);
        publish(RelationshipEvent.Kind.CLARIFICATION_REQUESTED, r, admin, notes(notes), now);
        return r;
    }

    @Transactional
    public Relationship reject(CurrentUser admin, UUID id, String notes) {
        requireNotes(notes);
        Relationship r = get(id);
        Instant now = Instant.now(clock);
        r.reject(admin.userId(), notes, now);
        publish(RelationshipEvent.Kind.REJECTED, r, admin, notes(notes), now);
        return r;
    }

    // ---------------------------------------------------------------- RelationshipQueries (module API)

    @Override
    @Transactional(readOnly = true)
    public boolean hasApprovedRelationship(UUID userA, UUID userB) {
        return relationships.existsApprovedBetween(userA, userB);
    }

    // ---------------------------------------------------------------- helpers

    private record Resolved(Relationship.Details details, UUID counterpartyUserId) {
    }

    private Resolved resolve(CurrentUser me, Command cmd) {
        if (cmd.counterpartyUserId() != null) {
            ParticipantSummary p = participants.findApproved(cmd.counterpartyUserId())
                    .filter(s -> s.role() == cmd.counterpartyRole())
                    .orElseThrow(() -> new BusinessRuleException("COUNTERPARTY_NOT_APPROVED",
                            "The selected participant is not an approved " + cmd.counterpartyRole()));
            if (p.userId().equals(me.userId())) {
                throw new BadRequestException("SELF_RELATIONSHIP", "You cannot register yourself");
            }
            boolean company = p.role() == Role.COLLECTOR && p.ruc() != null;
            Relationship.Details details = new Relationship.Details(
                    p.displayName(),
                    company ? IdDocumentType.RUC : p.documentType(),
                    company ? p.ruc() : p.documentNumber(),
                    blankToNull(cmd.phone()),
                    blankToNull(cmd.contactPerson()));
            return new Resolved(details, p.userId());
        }
        if (me.role() == Role.COLLECTOR) {
            throw new BadRequestException("COUNTERPARTY_REQUIRED", "Select an approved participant from the directory");
        }
        if (Validators.isBlank(cmd.entityName()) || cmd.documentType() == null || Validators.isBlank(cmd.documentNumber())) {
            throw new BadRequestException("ENTITY_DETAILS_REQUIRED", "Name, document type and document number are required");
        }
        String number = cmd.documentNumber().trim();
        if (!Validators.isValidDocument(cmd.documentType(), number)) {
            throw new BadRequestException("INVALID_DOCUMENT_NUMBER", "Invalid " + cmd.documentType() + " number");
        }
        Relationship.Details details = new Relationship.Details(cmd.entityName().trim(), cmd.documentType(), number,
                blankToNull(cmd.phone()), blankToNull(cmd.contactPerson()));
        UUID linked = participants.findApprovedByDocument(cmd.counterpartyRole(), number)
                .map(ParticipantSummary::userId)
                .filter(id -> !id.equals(me.userId()))
                .orElse(null);
        return new Resolved(details, linked);
    }

    private Relationship get(UUID id) {
        return relationships.findById(id).orElseThrow(() -> new NotFoundException("Relationship", id));
    }

    private void publish(RelationshipEvent.Kind kind, Relationship r, CurrentUser actor, Map<String, Object> details,
            Instant now) {
        events.publishEvent(new RelationshipEvent(kind, r.getId(), r.getOwnerUserId(), r.getCounterpartyUserId(),
                actor.userId(), actor.roleName(), details, now));
    }

    private static Map<String, Object> notes(String notes) {
        Map<String, Object> d = new HashMap<>();
        Optional.ofNullable(notes).filter(n -> !n.isBlank()).ifPresent(n -> d.put("notes", n));
        return d;
    }

    private static void requireNotes(String notes) {
        if (notes == null || notes.isBlank()) {
            throw new BadRequestException("NOTES_REQUIRED", "Please add a note for the requester");
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
