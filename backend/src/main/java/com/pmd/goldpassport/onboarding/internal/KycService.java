package com.pmd.goldpassport.onboarding.internal;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Service;

import com.pmd.goldpassport.onboarding.OnboardingEvent;
import com.pmd.goldpassport.onboarding.kyc.IdentityVerifier;
import com.pmd.goldpassport.onboarding.kyc.KycOutcome;
import com.pmd.goldpassport.onboarding.kyc.KycRequest;
import com.pmd.goldpassport.storage.FileStorage;

/**
 * Runs automated identity checks asynchronously after submission so the applicant does not wait
 * on external services. Failures leave the application in NEEDS_REVIEW; PMD always reviews.
 */
@Service
public class KycService {

    private static final Logger log = LoggerFactory.getLogger(KycService.class);

    private final OnboardingApplicationRepository applications;
    private final IdentityVerifier verifier;
    private final FileStorage files;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public KycService(OnboardingApplicationRepository applications, IdentityVerifier verifier, FileStorage files,
            ApplicationEventPublisher events, Clock clock) {
        this.applications = applications;
        this.verifier = verifier;
        this.files = files;
        this.events = events;
        this.clock = clock;
    }

    @ApplicationModuleListener
    public void onSubmitted(OnboardingEvent event) {
        if (event.kind() != OnboardingEvent.Kind.SUBMITTED) {
            return;
        }
        OnboardingApplication app = applications.findById(event.applicationId()).orElse(null);
        if (app == null) {
            return;
        }
        KycOutcome outcome;
        try {
            outcome = verifier.verify(new KycRequest(
                    app.getRole(),
                    app.getDocumentNumber(),
                    image(app, DocumentKind.ID_DOCUMENT),
                    image(app, DocumentKind.SELFIE),
                    image(app, DocumentKind.DRIVER_LICENSE)));
        } catch (RuntimeException e) {
            log.warn("KYC verification failed for application {}", app.getId(), e);
            outcome = new KycOutcome(KycStatus.NEEDS_REVIEW, "Automated checks failed to run: " + e.getMessage());
        }
        applications.updateKyc(app.getId(), outcome.status(), outcome.details());
        events.publishEvent(new OnboardingEvent(OnboardingEvent.Kind.KYC_COMPLETED, app.getId(), app.getUserId(),
                app.getRole().name(), null, "SYSTEM", Map.of("kycStatus", outcome.status().name()),
                Instant.now(clock)));
    }

    private KycRequest.Image image(OnboardingApplication app, DocumentKind kind) {
        Optional<ApplicationDocument> doc = app.latest(kind);
        return doc.map(d -> new KycRequest.Image(files.readAllBytes(d.getFileId()), d.getContentType())).orElse(null);
    }
}
