package com.pmd.goldpassport.onboarding.internal;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

import com.pmd.goldpassport.onboarding.OnboardingEvent;
import com.pmd.goldpassport.onboarding.kyc.IdentityVerifier;
import com.pmd.goldpassport.onboarding.kyc.KycOutcome;
import com.pmd.goldpassport.onboarding.kyc.KycRequest;
import com.pmd.goldpassport.shared.Role;
import com.pmd.goldpassport.storage.FileStorage;

/**
 * Runs automated identity checks asynchronously after submission so the applicant does not wait
 * on external services. Failures leave the application in NEEDS_REVIEW; PMD always reviews.
 *
 * <p>The checks (Amazon Rekognition, S3 downloads) run between two short transactions, one reading
 * the application and one writing the outcome, so no pooled database connection waits on them.
 * The listener is therefore not an {@code @ApplicationModuleListener}, which would wrap it all in one
 * transaction; Spring Modulith still records and re-delivers the event.
 */
@Service
public class KycService {

    private static final Logger log = LoggerFactory.getLogger(KycService.class);

    private final OnboardingApplicationRepository applications;
    private final IdentityVerifier verifier;
    private final FileStorage files;
    private final ApplicationEventPublisher events;
    private final Clock clock;
    private final TransactionTemplate tx;

    public KycService(OnboardingApplicationRepository applications, IdentityVerifier verifier, FileStorage files,
            ApplicationEventPublisher events, Clock clock, PlatformTransactionManager transactions) {
        this.applications = applications;
        this.verifier = verifier;
        this.files = files;
        this.events = events;
        this.clock = clock;
        this.tx = new TransactionTemplate(transactions);
    }

    /** What the checks need, read in a short transaction (the documents are a lazy collection). */
    private record Subject(UUID applicationId, UUID userId, Role role, String documentNumber, Document idDocument,
            Document selfie, Document driverLicense) {
    }

    private record Document(UUID fileId, String contentType) {
    }

    @Async
    @TransactionalEventListener
    public void onSubmitted(OnboardingEvent event) {
        if (event.kind() != OnboardingEvent.Kind.SUBMITTED) {
            return;
        }
        Subject subject = tx.execute(status -> applications.findById(event.applicationId())
                .map(app -> new Subject(app.getId(), app.getUserId(), app.getRole(), app.getDocumentNumber(),
                        document(app, DocumentKind.ID_DOCUMENT), document(app, DocumentKind.SELFIE),
                        document(app, DocumentKind.DRIVER_LICENSE)))
                .orElse(null));
        if (subject == null) {
            return;
        }
        KycOutcome outcome;
        try {
            outcome = verifier.verify(new KycRequest(
                    subject.role(),
                    subject.documentNumber(),
                    image(subject.idDocument()),
                    image(subject.selfie()),
                    image(subject.driverLicense())));
        } catch (RuntimeException e) {
            log.warn("KYC verification failed for application {}", subject.applicationId(), e);
            outcome = new KycOutcome(KycStatus.NEEDS_REVIEW, "Automated checks failed to run: " + e.getMessage());
        }
        KycOutcome result = outcome;
        tx.executeWithoutResult(status -> {
            applications.updateKyc(subject.applicationId(), result.status(), result.details());
            events.publishEvent(new OnboardingEvent(OnboardingEvent.Kind.KYC_COMPLETED, subject.applicationId(),
                    subject.userId(), subject.role().name(), null, "SYSTEM",
                    Map.of("kycStatus", result.status().name()), Instant.now(clock)));
        });
    }

    private static Document document(OnboardingApplication app, DocumentKind kind) {
        Optional<ApplicationDocument> doc = app.latest(kind);
        return doc.map(d -> new Document(d.getFileId(), d.getContentType())).orElse(null);
    }

    private KycRequest.Image image(Document doc) {
        return doc == null ? null : new KycRequest.Image(files.readAllBytes(doc.fileId()), doc.contentType());
    }
}
