package com.pmd.goldpassport.identity.web;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.pmd.goldpassport.identity.internal.IdentityProperties;
import com.pmd.goldpassport.identity.internal.OtpService;
import com.pmd.goldpassport.identity.web.IdentityDtos.AuthConfig;
import com.pmd.goldpassport.identity.web.IdentityDtos.OtpChallenge;
import com.pmd.goldpassport.identity.web.IdentityDtos.OtpRequest;
import com.pmd.goldpassport.identity.web.IdentityDtos.OtpVerifyRequest;
import com.pmd.goldpassport.identity.web.IdentityDtos.TokenResponse;
import com.pmd.goldpassport.identity.web.IdentityDtos.UserProfile;
import com.pmd.goldpassport.shared.ApiException;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/auth")
class AuthController {

    private final OtpService otp;
    private final IdentityProperties props;

    AuthController(OtpService otp, IdentityProperties props) {
        this.otp = otp;
        this.props = props;
    }

    @GetMapping("/config")
    AuthConfig config() {
        if (props.isLocal()) {
            return new AuthConfig("local", null, null);
        }
        return new AuthConfig("cognito", props.cognito().region(), props.cognito().clientId());
    }

    @PostMapping("/otp/request")
    @ResponseStatus(HttpStatus.ACCEPTED)
    OtpChallenge request(@Valid @RequestBody OtpRequest body) {
        requireLocalMode();
        OtpService.Issued issued = otp.request(body.phone());
        return new OtpChallenge(issued.expiresInSeconds(), issued.devCode());
    }

    @PostMapping("/otp/verify")
    TokenResponse verify(@Valid @RequestBody OtpVerifyRequest body) {
        requireLocalMode();
        OtpService.LoggedIn result = otp.verify(body.phone(), body.code());
        return new TokenResponse(result.accessToken(), "Bearer", result.expiresInSeconds(), UserProfile.of(result.user()));
    }

    private void requireLocalMode() {
        if (!props.isLocal()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_AVAILABLE",
                    "OTP login is handled by Amazon Cognito in this environment") {
            };
        }
    }
}
