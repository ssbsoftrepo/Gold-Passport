package com.pmd.goldpassport.identity.internal;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface OtpChallengeRepository extends JpaRepository<OtpChallenge, UUID> {

    Optional<OtpChallenge> findFirstByPhoneOrderByCreatedAtDesc(String phone);

    long countByPhoneAndCreatedAtAfter(String phone, Instant since);
}
