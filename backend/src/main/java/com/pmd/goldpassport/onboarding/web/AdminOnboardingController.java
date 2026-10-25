package com.pmd.goldpassport.onboarding.web;

import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.onboarding.internal.OnboardingService;
import com.pmd.goldpassport.onboarding.internal.OnboardingStatus;
import com.pmd.goldpassport.onboarding.web.OnboardingDtos.OnboardingApplicationDto;
import com.pmd.goldpassport.onboarding.web.OnboardingDtos.ReviewDecisionRequest;

import jakarta.validation.Valid;

/** PMD back office: identity verification queue. Path is ADMIN-only (see SecurityConfig). */
@RestController
@RequestMapping("/api/v1/admin/onboarding")
class AdminOnboardingController {

    private final OnboardingService onboarding;

    AdminOnboardingController(OnboardingService onboarding) {
        this.onboarding = onboarding;
    }

    @GetMapping
    List<OnboardingApplicationDto> list(@RequestParam(required = false) OnboardingStatus status) {
        return onboarding.list(status).stream().map(OnboardingApplicationDto::of).toList();
    }

    @GetMapping("/{applicationId}")
    OnboardingApplicationDto get(@PathVariable UUID applicationId) {
        return OnboardingApplicationDto.of(onboarding.get(applicationId));
    }

    @PostMapping("/{applicationId}/approve")
    OnboardingApplicationDto approve(CurrentUser me, @PathVariable UUID applicationId,
            @Valid @RequestBody ReviewDecisionRequest body) {
        return OnboardingApplicationDto.of(onboarding.approve(me, applicationId, body.notes()));
    }

    @PostMapping("/{applicationId}/request-corrections")
    OnboardingApplicationDto requestCorrections(CurrentUser me, @PathVariable UUID applicationId,
            @Valid @RequestBody ReviewDecisionRequest body) {
        return OnboardingApplicationDto.of(onboarding.requestCorrections(me, applicationId, body.notes()));
    }

    @PostMapping("/{applicationId}/reject")
    OnboardingApplicationDto reject(CurrentUser me, @PathVariable UUID applicationId,
            @Valid @RequestBody ReviewDecisionRequest body) {
        return OnboardingApplicationDto.of(onboarding.reject(me, applicationId, body.notes()));
    }
}
