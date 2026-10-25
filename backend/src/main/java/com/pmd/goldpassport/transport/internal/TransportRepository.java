package com.pmd.goldpassport.transport.internal;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TransportRepository extends JpaRepository<Transport, UUID> {

    @Query("""
            select t from Transport t
            where t.transporterUserId = :userId or t.minerUserId = :userId or t.collectorUserId = :userId
            order by t.updatedAt desc
            """)
    List<Transport> findForParticipant(@Param("userId") UUID userId);

    List<Transport> findAllByOrderByUpdatedAtDesc();

    List<Transport> findByStatusOrderByUpdatedAtDesc(TransportStatus status);
}
