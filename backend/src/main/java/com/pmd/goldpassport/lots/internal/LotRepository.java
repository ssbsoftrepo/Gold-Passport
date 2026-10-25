package com.pmd.goldpassport.lots.internal;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.pmd.goldpassport.lots.LotStatus;

public interface LotRepository extends JpaRepository<Lot, UUID> {

    Optional<Lot> findByCode(String code);

    @Query("""
            select l from Lot l
            where l.minerUserId = :userId or l.transporterUserId = :userId or l.collectorUserId = :userId
            order by l.createdAt desc
            """)
    List<Lot> findForParticipant(@Param("userId") UUID userId);

    List<Lot> findAllByOrderByCreatedAtDesc();

    List<Lot> findByStatusOrderByCreatedAtDesc(LotStatus status);
}
