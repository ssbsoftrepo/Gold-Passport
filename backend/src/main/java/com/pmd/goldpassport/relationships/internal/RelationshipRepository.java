package com.pmd.goldpassport.relationships.internal;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.pmd.goldpassport.shared.Role;

public interface RelationshipRepository extends JpaRepository<Relationship, UUID> {

    @Query("""
            select r from Relationship r
            where r.ownerUserId = :userId
               or (r.counterpartyUserId = :userId and r.status = com.pmd.goldpassport.relationships.internal.RelationshipStatus.APPROVED)
            order by r.updatedAt desc
            """)
    List<Relationship> findVisibleTo(@Param("userId") UUID userId);

    List<Relationship> findByStatusOrderByCreatedAtAsc(RelationshipStatus status);

    List<Relationship> findAllByOrderByUpdatedAtDesc();

    boolean existsByOwnerUserIdAndCounterpartyRoleAndDocumentNumberAndStatusIn(UUID ownerUserId, Role counterpartyRole,
            String documentNumber, Collection<RelationshipStatus> statuses);

    @Query("""
            select case when count(r) > 0 then true else false end from Relationship r
            where r.status = com.pmd.goldpassport.relationships.internal.RelationshipStatus.APPROVED
              and ((r.ownerUserId = :a and r.counterpartyUserId = :b) or (r.ownerUserId = :b and r.counterpartyUserId = :a))
            """)
    boolean existsApprovedBetween(@Param("a") UUID a, @Param("b") UUID b);
}
