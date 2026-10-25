package com.pmd.goldpassport.onboarding.web;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.pmd.goldpassport.onboarding.ParticipantSummary;
import com.pmd.goldpassport.onboarding.internal.ApplicationDocument;
import com.pmd.goldpassport.onboarding.internal.DocumentKind;
import com.pmd.goldpassport.onboarding.internal.KycStatus;
import com.pmd.goldpassport.onboarding.internal.OnboardingApplication;
import com.pmd.goldpassport.onboarding.internal.OnboardingChanges;
import com.pmd.goldpassport.onboarding.internal.OnboardingStatus;
import com.pmd.goldpassport.onboarding.internal.Requirements;
import com.pmd.goldpassport.shared.IdDocumentType;
import com.pmd.goldpassport.shared.Role;
import com.pmd.goldpassport.shared.Validators;

import jakarta.validation.constraints.Size;

final class OnboardingDtos {

    private OnboardingDtos() {
    }

    record OnboardingDocument(UUID id, DocumentKind kind, UUID fileId, String fileName, String contentType,
            String sha256, Instant uploadedAt) {

        static OnboardingDocument of(ApplicationDocument d) {
            return new OnboardingDocument(d.getId(), d.getKind(), d.getFileId(), d.getFileName(), d.getContentType(),
                    d.getSha256(), d.getUploadedAt());
        }
    }

    record OnboardingApplicationDto(UUID id, UUID userId, Role role, OnboardingStatus status, String phone,
            String fullName, IdDocumentType documentType, String documentNumber, String email,
            String driverLicenseNumber, String vehiclePlate, String companyName, String ruc, String companyAddress,
            String legalRepresentative, List<OnboardingDocument> documents, KycStatus kycStatus, String kycDetails,
            String reviewNotes, List<String> missingRequirements, Instant submittedAt, Instant reviewedAt,
            Instant createdAt, Instant updatedAt) {

        static OnboardingApplicationDto of(OnboardingApplication a) {
            return new OnboardingApplicationDto(a.getId(), a.getUserId(), a.getRole(), a.getStatus(), a.getPhone(),
                    a.getFullName(), a.getDocumentType(), a.getDocumentNumber(), a.getEmail(),
                    a.getDriverLicenseNumber(), a.getVehiclePlate(), a.getCompanyName(), a.getRuc(),
                    a.getCompanyAddress(), a.getLegalRepresentative(),
                    a.getDocuments().stream().map(OnboardingDocument::of).toList(),
                    a.getKycStatus(), a.getKycDetails(), a.getReviewNotes(),
                    a.getStatus().isEditable() ? Requirements.missing(a) : List.of(),
                    a.getSubmittedAt(), a.getReviewedAt(), a.getCreatedAt(), a.getUpdatedAt());
        }
    }

    record OnboardingUpdateRequest(
            @Size(max = 200) String fullName,
            IdDocumentType documentType,
            @Size(max = 20) String documentNumber,
            @Size(max = 200) String email,
            @Size(max = 30) String driverLicenseNumber,
            @Size(max = 15) String vehiclePlate,
            @Size(max = 200) String companyName,
            @Size(max = 11) String ruc,
            @Size(max = 300) String companyAddress,
            @Size(max = 200) String legalRepresentative) {

        OnboardingChanges toChanges() {
            return new OnboardingChanges(fullName, documentType, documentNumber, email, driverLicenseNumber,
                    vehiclePlate, companyName, ruc, companyAddress, legalRepresentative);
        }
    }

    record ReviewDecisionRequest(@Size(max = 2000) String notes) {
    }

    record Participant(UUID userId, Role role, String displayName, IdDocumentType documentType,
            String documentNumberMasked, String companyName, String ruc) {

        static Participant of(ParticipantSummary p) {
            return new Participant(p.userId(), p.role(), p.displayName(), p.documentType(),
                    Validators.mask(p.documentNumber()), p.companyName(), p.ruc());
        }
    }
}
