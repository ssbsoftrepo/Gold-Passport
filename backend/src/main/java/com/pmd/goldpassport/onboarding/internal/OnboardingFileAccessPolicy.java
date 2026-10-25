package com.pmd.goldpassport.onboarding.internal;

import java.util.UUID;

import org.springframework.stereotype.Component;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.storage.FileAccessPolicy;

/** KYC documents are visible only to the applicant (uploader) and PMD admins. */
@Component
class OnboardingFileAccessPolicy implements FileAccessPolicy {

    private final OnboardingApplicationRepository applications;

    OnboardingFileAccessPolicy(OnboardingApplicationRepository applications) {
        this.applications = applications;
    }

    @Override
    public String contextType() {
        return OnboardingService.FILE_CONTEXT;
    }

    @Override
    public boolean canRead(CurrentUser user, UUID applicationId) {
        return applications.findById(applicationId).map(a -> a.getUserId().equals(user.userId())).orElse(false);
    }
}
