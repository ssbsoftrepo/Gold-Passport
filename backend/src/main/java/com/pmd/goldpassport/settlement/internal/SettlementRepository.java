package com.pmd.goldpassport.settlement.internal;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SettlementRepository extends JpaRepository<Settlement, UUID> {

    Optional<Settlement> findByLotId(UUID lotId);

    @Query("select s from Settlement s where s.minerUserId = :userId or s.collectorUserId = :userId order by s.updatedAt desc")
    List<Settlement> findForParticipant(@Param("userId") UUID userId);

    List<Settlement> findAllByOrderByUpdatedAtDesc();

    List<Settlement> findByStatusOrderByUpdatedAtAsc(SettlementStatus status);
}
