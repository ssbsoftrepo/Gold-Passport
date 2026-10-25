package com.pmd.goldpassport.lab.internal;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface LabResultRepository extends JpaRepository<LabResult, UUID> {

    Optional<LabResult> findByLotId(UUID lotId);

    boolean existsByLotId(UUID lotId);

    List<LabResult> findAllByOrderByRecordedAtDesc();

    List<LabResult> findByStatusOrderByRecordedAtAsc(LabResultStatus status);
}
