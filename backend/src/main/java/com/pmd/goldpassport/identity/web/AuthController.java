package com.pmd.goldpassport.identity.web;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.pmd.goldpassport.identity.internal.IdentityProperties;
import com.pmd.goldpassport.identity.internal.LocalPinService;
import com.pmd.goldpassport.identity.web.IdentityDtos.AuthConfig;
import com.pmd.goldpassport.identity.web.IdentityDtos.NewPinRequest;
import com.pmd.goldpassport.identity.web.IdentityDtos.PinSignInRequest;
import com.pmd.goldpassport.identity.web.IdentityDtos.TokenResponse;
import com.pmd.goldpassport.identity.web.IdentityDtos.UserProfile;

import jakarta.validation.Valid;

/**
 * Phone number + PIN sign-in. In Amazon Cognito mode the apps talk to Cognito directly and the
 * {@code /pin} endpoints answer 404; {@code /config} tells the apps which mode is active.
 */
@RestController
@RequestMapping("/api/v1/auth")
class AuthController {

    private final LocalPinService pins;
    private final IdentityProperties props;

    AuthController(LocalPinService pins, IdentityProperties props) {
        this.pins = pins;
        this.props = props;
    }

    @GetMapping("/config")
    AuthConfig config() {
        if (props.isLocal()) {
            return new AuthConfig("local", null, null);
        }
        return new AuthConfig("cognito", props.cognito().region(), props.cognito().clientId());
    }

    @PostMapping("/pin/sign-up")
    @ResponseStatus(HttpStatus.CREATED)
    TokenResponse signUp(@Valid @RequestBody PinSignInRequest body) {
        LocalModeOnly.require(props);
        return token(pins.signUp(body.phone(), body.pin()));
    }

    @PostMapping("/pin/sign-in")
    TokenResponse signIn(@Valid @RequestBody PinSignInRequest body) {
        LocalModeOnly.require(props);
        return token(pins.signIn(body.phone(), body.pin()));
    }

    @PostMapping("/pin/new")
    TokenResponse replaceTemporary(@Valid @RequestBody NewPinRequest body) {
        LocalModeOnly.require(props);
        return token(pins.replaceTemporary(body.phone(), body.temporaryPin(), body.newPin()));
    }

    private static TokenResponse token(LocalPinService.LoggedIn result) {
        return new TokenResponse(result.accessToken(), "Bearer", result.expiresInSeconds(), UserProfile.of(result.user()));
    }
}
