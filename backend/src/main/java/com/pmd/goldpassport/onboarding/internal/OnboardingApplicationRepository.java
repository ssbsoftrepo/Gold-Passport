package com.pmd.goldpassport.onboarding.internal;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.pmd.goldpassport.shared.Role;

public interface OnboardingApplicationRepository extends JpaRepository<OnboardingApplication, UUID> {

    Optional<OnboardingApplication> findByUserId(UUID userId);

    List<OnboardingApplication> findByStatusOrderBySubmittedAtAsc(OnboardingStatus status);

    List<OnboardingApplication> findAllByOrderByUpdatedAtDesc();

    List<OnboardingApplication> findByStatus(OnboardingStatus status);

    List<OnboardingApplication> findByStatusAndRole(OnboardingStatus status, Role role);

    boolean existsByUserIdAndStatus(UUID userId, OnboardingStatus status);

    /** KYC results are written without bumping the version so they never clash with a reviewer. */
    @Modifying(clearAutomatically = true)
    @Query("update OnboardingApplication a set a.kycStatus = :status, a.kycDetails = :details where a.id = :id")
    int updateKyc(@Param("id") UUID id, @Param("status") KycStatus status, @Param("details") String details);
}
