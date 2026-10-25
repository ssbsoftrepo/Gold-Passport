package com.pmd.goldpassport.onboarding.web;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.onboarding.internal.DocumentKind;
import com.pmd.goldpassport.onboarding.internal.OnboardingService;
import com.pmd.goldpassport.onboarding.web.OnboardingDtos.OnboardingApplicationDto;
import com.pmd.goldpassport.onboarding.web.OnboardingDtos.OnboardingDocument;
import com.pmd.goldpassport.onboarding.web.OnboardingDtos.OnboardingUpdateRequest;
import com.pmd.goldpassport.onboarding.web.OnboardingDtos.Participant;
import com.pmd.goldpassport.shared.Role;

import jakarta.validation.Valid;

@RestController
class OnboardingController {

    private final OnboardingService onboarding;

    OnboardingController(OnboardingService onboarding) {
        this.onboarding = onboarding;
    }

    @GetMapping("/api/v1/onboarding/me")
    OnboardingApplicationDto mine(CurrentUser me) {
        return OnboardingApplicationDto.of(onboarding.getOrCreate(me));
    }

    @PutMapping("/api/v1/onboarding/me")
    OnboardingApplicationDto update(CurrentUser me, @Valid @RequestBody OnboardingUpdateRequest body) {
        return OnboardingApplicationDto.of(onboarding.update(me, body.toChanges()));
    }

    @PostMapping(path = "/api/v1/onboarding/me/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    OnboardingDocument upload(CurrentUser me, @RequestParam("kind") DocumentKind kind,
            @RequestPart("file") MultipartFile file) {
        return OnboardingDocument.of(onboarding.uploadDocument(me, kind, file));
    }

    @PostMapping("/api/v1/onboarding/me/submit")
    OnboardingApplicationDto submit(CurrentUser me) {
        return OnboardingApplicationDto.of(onboarding.submit(me));
    }

    /** Directory of approved participants (any authenticated, approved user may search it). */
    @GetMapping("/api/v1/participants")
    List<Participant> participants(CurrentUser me, @RequestParam(required = false) Role role,
            @RequestParam(required = false) String q) {
        onboarding.requireApproved(me);
        return onboarding.search(role, q).stream().map(Participant::of).toList();
    }
}
