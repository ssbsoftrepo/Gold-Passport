package com.pmd.goldpassport.onboarding.internal;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.pmd.goldpassport.shared.IdDocumentType;
import com.pmd.goldpassport.shared.InvalidStateException;
import com.pmd.goldpassport.shared.Role;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

/** One onboarding (KYC) application per user. */
@Entity
@Table(name = "applications", schema = "onboarding")
public class OnboardingApplication {

    @Id
    private UUID id;

    private UUID userId;

    @Enumerated(EnumType.STRING)
    private Role role;

    @Enumerated(EnumType.STRING)
    private OnboardingStatus status;

    private String phone;

    // Person (Miner, Transporter)
    private String fullName;

    @Enumerated(EnumType.STRING)
    private IdDocumentType documentType;

    private String documentNumber;

    private String email;

    // Transporter
    private String driverLicenseNumber;

    private String vehiclePlate;

    // Company (Collector/Plant)
    private String companyName;

    private String ruc;

    private String companyAddress;

    private String legalRepresentative;

    @Enumerated(EnumType.STRING)
    private KycStatus kycStatus;

    private String kycDetails;

    private String reviewNotes;

    private UUID reviewerId;

    private Instant submittedAt;

    private Instant reviewedAt;

    private Instant createdAt;

    private Instant updatedAt;

    @Version
    private Long version;

    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @JoinColumn(name = "application_id", nullable = false)
    @OrderBy("uploadedAt ASC")
    private List<ApplicationDocument> documents = new ArrayList<>();

    protected OnboardingApplication() {
    }

    public static OnboardingApplication draft(UUID userId, Role role, String phone, Instant now) {
        OnboardingApplication a = new OnboardingApplication();
        a.id = UUID.randomUUID();
        a.userId = userId;
        a.role = role;
        a.phone = phone;
        a.status = OnboardingStatus.DRAFT;
        a.kycStatus = KycStatus.NOT_RUN;
        a.createdAt = now;
        a.updatedAt = now;
        return a;
    }

    // ---------------------------------------------------------------- behaviour

    public void update(OnboardingChanges c, Instant now) {
        requireEditable("update");
        fullName = apply(fullName, c.fullName());
        if (c.documentType() != null) {
            documentType = c.documentType();
        }
        documentNumber = apply(documentNumber, c.documentNumber());
        email = apply(email, c.email());
        driverLicenseNumber = apply(driverLicenseNumber, c.driverLicenseNumber());
        vehiclePlate = apply(vehiclePlate, c.vehiclePlate() == null ? null : c.vehiclePlate().toUpperCase());
        companyName = apply(companyName, c.companyName());
        ruc = apply(ruc, c.ruc());
        companyAddress = apply(companyAddress, c.companyAddress());
        legalRepresentative = apply(legalRepresentative, c.legalRepresentative());
        updatedAt = now;
    }

    public ApplicationDocument addDocument(ApplicationDocument doc, Instant now) {
        requireEditable("upload document");
        documents.add(doc);
        updatedAt = now;
        return doc;
    }

    public void submit(Instant now) {
        requireEditable("submit");
        List<String> missing = Requirements.missing(this);
        if (!missing.isEmpty()) {
            throw new MissingRequirementsException(missing);
        }
        status = OnboardingStatus.SUBMITTED;
        kycStatus = KycStatus.NOT_RUN;
        kycDetails = null;
        submittedAt = now;
        updatedAt = now;
    }

    public void approve(UUID reviewer, String notes, Instant now) {
        review(OnboardingStatus.APPROVED, reviewer, notes, now, "approve");
    }

    public void requestCorrections(UUID reviewer, String notes, Instant now) {
        review(OnboardingStatus.CORRECTIONS_REQUESTED, reviewer, notes, now, "request corrections");
    }

    public void reject(UUID reviewer, String notes, Instant now) {
        review(OnboardingStatus.REJECTED, reviewer, notes, now, "reject");
    }

    private void review(OnboardingStatus target, UUID reviewer, String notes, Instant now, String action) {
        if (status != OnboardingStatus.SUBMITTED) {
            throw InvalidStateException.of("Onboarding application", status, action);
        }
        status = target;
        reviewerId = reviewer;
        reviewNotes = notes;
        reviewedAt = now;
        updatedAt = now;
    }

    private void requireEditable(String action) {
        if (!status.isEditable()) {
            throw InvalidStateException.of("Onboarding application", status, action);
        }
    }

    private static String apply(String current, String change) {
        if (change == null) {
            return current;
        }
        String trimmed = change.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /** Latest uploaded document of a kind. */
    public Optional<ApplicationDocument> latest(DocumentKind kind) {
        return documents.stream()
                .filter(d -> d.getKind() == kind)
                .max(Comparator.comparing(ApplicationDocument::getUploadedAt));
    }

    public String displayName() {
        return role == Role.COLLECTOR && companyName != null ? companyName : fullName;
    }

    // ---------------------------------------------------------------- getters

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public Role getRole() {
        return role;
    }

    public OnboardingStatus getStatus() {
        return status;
    }

    public String getPhone() {
        return phone;
    }

    public String getFullName() {
        return fullName;
    }

    public IdDocumentType getDocumentType() {
        return documentType;
    }

    public String getDocumentNumber() {
        return documentNumber;
    }

    public String getEmail() {
        return email;
    }

    public String getDriverLicenseNumber() {
        return driverLicenseNumber;
    }

    public String getVehiclePlate() {
        return vehiclePlate;
    }

    public String getCompanyName() {
        return companyName;
    }

    public String getRuc() {
        return ruc;
    }

    public String getCompanyAddress() {
        return companyAddress;
    }

    public String getLegalRepresentative() {
        return legalRepresentative;
    }

    public KycStatus getKycStatus() {
        return kycStatus;
    }

    public String getKycDetails() {
        return kycDetails;
    }

    public String getReviewNotes() {
        return reviewNotes;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public Instant getReviewedAt() {
        return reviewedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public List<ApplicationDocument> getDocuments() {
        return documents;
    }
}
