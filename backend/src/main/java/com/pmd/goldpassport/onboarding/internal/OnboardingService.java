package com.pmd.goldpassport.onboarding.internal;

import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.identity.UserAccounts;
import com.pmd.goldpassport.onboarding.OnboardingEvent;
import com.pmd.goldpassport.onboarding.ParticipantDirectory;
import com.pmd.goldpassport.onboarding.ParticipantSummary;
import com.pmd.goldpassport.shared.BadRequestException;
import com.pmd.goldpassport.shared.ForbiddenException;
import com.pmd.goldpassport.shared.InvalidStateException;
import com.pmd.goldpassport.shared.NotFoundException;
import com.pmd.goldpassport.shared.Role;
import com.pmd.goldpassport.storage.FileStorage;
import com.pmd.goldpassport.storage.StoredFileInfo;

@Service
public class OnboardingService implements ParticipantDirectory {

    public static final String FILE_CONTEXT = "onboarding";

    private final OnboardingApplicationRepository applications;
    private final FileStorage files;
    private final UserAccounts userAccounts;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public OnboardingService(OnboardingApplicationRepository applications, FileStorage files,
            UserAccounts userAccounts, ApplicationEventPublisher events, Clock clock) {
        this.applications = applications;
        this.files = files;
        this.userAccounts = userAccounts;
        this.events = events;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- applicant

    /** Returns the caller's application, creating a DRAFT on first access. */
    @Transactional
    public OnboardingApplication getOrCreate(CurrentUser me) {
        if (me.role() == null) {
            throw new InvalidStateException("ROLE_NOT_SET", "Choose a role before starting onboarding");
        }
        if (me.isAdmin()) {
            throw new ForbiddenException("NOT_APPLICABLE", "PMD staff do not go through onboarding");
        }
        return applications.findByUserId(me.userId())
                .orElseGet(() -> applications.save(
                        OnboardingApplication.draft(me.userId(), me.role(), me.phone(), Instant.now(clock))));
    }

    @Transactional
    public OnboardingApplication update(CurrentUser me, OnboardingChanges changes) {
        OnboardingApplication app = getOrCreate(me);
        app.update(changes, Instant.now(clock));
        return app;
    }

    @Transactional
    public ApplicationDocument uploadDocument(CurrentUser me, DocumentKind kind, MultipartFile file) {
        if (kind == null) {
            throw new BadRequestException("DOCUMENT_KIND_REQUIRED", "Document kind is required");
        }
        OnboardingApplication app = getOrCreate(me);
        if (!app.getStatus().isEditable()) {
            throw InvalidStateException.of("Onboarding application", app.getStatus(), "upload document");
        }
        StoredFileInfo stored = files.store(file, FILE_CONTEXT, app.getId(), me.userId());
        return app.addDocument(ApplicationDocument.of(kind, stored), Instant.now(clock));
    }

    @Transactional
    public OnboardingApplication submit(CurrentUser me) {
        OnboardingApplication app = getOrCreate(me);
        Instant now = Instant.now(clock);
        app.submit(now);
        publish(OnboardingEvent.Kind.SUBMITTED, app, me, Map.of("role", app.getRole().name()), now);
        return app;
    }

    // ---------------------------------------------------------------- back office

    @Transactional(readOnly = true)
    public List<OnboardingApplication> list(OnboardingStatus status) {
        return status == null
                ? applications.findAllByOrderByUpdatedAtDesc()
                : applications.findByStatusOrderBySubmittedAtAsc(status);
    }

    @Transactional(readOnly = true)
    public OnboardingApplication get(UUID applicationId) {
        return applications.findById(applicationId).orElseThrow(() -> new NotFoundException("Application", applicationId));
    }

    @Transactional
    public OnboardingApplication approve(CurrentUser admin, UUID applicationId, String notes) {
        OnboardingApplication app = get(applicationId);
        Instant now = Instant.now(clock);
        app.approve(admin.userId(), notes, now);
        userAccounts.updateDisplayName(app.getUserId(), app.displayName());
        publish(OnboardingEvent.Kind.APPROVED, app, admin, notesDetails(notes), now);
        return app;
    }

    @Transactional
    public OnboardingApplication requestCorrections(CurrentUser admin, UUID applicationId, String notes) {
        requireNotes(notes);
        OnboardingApplication app = get(applicationId);
        Instant now = Instant.now(clock);
        app.requestCorrections(admin.userId(), notes, now);
        publish(OnboardingEvent.Kind.CORRECTIONS_REQUESTED, app, admin, notesDetails(notes), now);
        return app;
    }

    @Transactional
    public OnboardingApplication reject(CurrentUser admin, UUID applicationId, String notes) {
        requireNotes(notes);
        OnboardingApplication app = get(applicationId);
        Instant now = Instant.now(clock);
        app.reject(admin.userId(), notes, now);
        publish(OnboardingEvent.Kind.REJECTED, app, admin, notesDetails(notes), now);
        return app;
    }

    // ---------------------------------------------------------------- ParticipantDirectory (module API)

    @Override
    @Transactional(readOnly = true)
    public boolean isApproved(UUID userId) {
        return applications.existsByUserIdAndStatus(userId, OnboardingStatus.APPROVED);
    }

    @Override
    @Transactional(readOnly = true)
    public void requireApproved(CurrentUser user) {
        if (!user.isAdmin() && !isApproved(user.userId())) {
            throw new ForbiddenException("ONBOARDING_NOT_APPROVED",
                    "Your onboarding must be approved by PMD before you can do this");
        }
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ParticipantSummary> findApproved(UUID userId) {
        return applications.findByUserId(userId)
                .filter(a -> a.getStatus() == OnboardingStatus.APPROVED)
                .map(OnboardingService::summary);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ParticipantSummary> findApprovedByDocument(Role role, String documentNumber) {
        if (documentNumber == null || documentNumber.isBlank()) {
            return Optional.empty();
        }
        String wanted = documentNumber.trim();
        return applications.findByStatusAndRole(OnboardingStatus.APPROVED, role).stream()
                .filter(a -> wanted.equalsIgnoreCase(a.getDocumentNumber()) || wanted.equals(a.getRuc()))
                .findFirst()
                .map(OnboardingService::summary);
    }

    /**
     * In-memory filtering keeps this simple; move to a database search (pg_trgm) once there are
     * tens of thousands of participants.
     */
    @Override
    @Transactional(readOnly = true)
    public List<ParticipantSummary> search(Role role, String query) {
        List<OnboardingApplication> approved = role == null
                ? applications.findByStatus(OnboardingStatus.APPROVED)
                : applications.findByStatusAndRole(OnboardingStatus.APPROVED, role);
        String q = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        return approved.stream()
                .filter(a -> q.isEmpty() || contains(a.getFullName(), q) || contains(a.getCompanyName(), q)
                        || contains(a.getDocumentNumber(), q) || contains(a.getRuc(), q))
                .limit(50)
                .map(OnboardingService::summary)
                .toList();
    }

    // ---------------------------------------------------------------- helpers

    private void publish(OnboardingEvent.Kind kind, OnboardingApplication app, CurrentUser actor,
            Map<String, Object> details, Instant now) {
        events.publishEvent(new OnboardingEvent(kind, app.getId(), app.getUserId(), app.getRole().name(),
                actor.userId(), actor.roleName(), details, now));
    }

    private static Map<String, Object> notesDetails(String notes) {
        Map<String, Object> d = new HashMap<>();
        if (notes != null && !notes.isBlank()) {
            d.put("notes", notes);
        }
        return d;
    }

    private static void requireNotes(String notes) {
        if (notes == null || notes.isBlank()) {
            throw new BadRequestException("NOTES_REQUIRED", "Please explain what the applicant must change");
        }
    }

    private static boolean contains(String value, String q) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(q);
    }

    private static ParticipantSummary summary(OnboardingApplication a) {
        return new ParticipantSummary(a.getUserId(), a.getRole(), a.displayName(), a.getDocumentType(),
                a.getDocumentNumber(), a.getCompanyName(), a.getRuc());
    }
}
