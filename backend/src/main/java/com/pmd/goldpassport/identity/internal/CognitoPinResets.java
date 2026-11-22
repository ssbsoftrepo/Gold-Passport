package com.pmd.goldpassport.identity.internal;

import java.time.Clock;
import java.time.Instant;

import com.pmd.goldpassport.shared.InvalidStateException;

import software.amazon.awssdk.services.cognitoidentityprovider.CognitoIdentityProviderClient;
import software.amazon.awssdk.services.cognitoidentityprovider.model.UserNotFoundException;

/**
 * Resets a PIN in the Amazon Cognito user pool: sets a temporary password (the person must choose a
 * new PIN at the next sign-in) and signs the account out everywhere, so a lost phone stops working.
 */
class CognitoPinResets implements PinResets {

    private final CognitoIdentityProviderClient cognito;
    private final String userPoolId;
    private final IdentityProperties props;
    private final Clock clock;

    CognitoPinResets(CognitoIdentityProviderClient cognito, String userPoolId, IdentityProperties props, Clock clock) {
        this.cognito = cognito;
        this.userPoolId = userPoolId;
        this.props = props;
        this.clock = clock;
    }

    @Override
    public TemporaryPin reset(User target) {
        // The Cognito username is the user's `sub`, stored as auth subject at the first sign-in. Accounts
        // that PMD created but nobody signed into yet still carry their own id there.
        String username = target.getAuthSubject();
        if (username == null || username.equals(target.getId().toString())) {
            throw noAccount();
        }
        String temporary = LocalPinService.temporaryFor(target.getRole());
        try {
            cognito.adminSetUserPassword(r -> r.userPoolId(userPoolId).username(username)
                    .password(temporary).permanent(false));
            cognito.adminUserGlobalSignOut(r -> r.userPoolId(userPoolId).username(username));
        } catch (UserNotFoundException e) {
            throw noAccount();
        }
        // The pool's temporary password validity is set to the same number of days (infra/).
        return new TemporaryPin(temporary, Instant.now(clock).plus(props.temporaryPinTtlOrDefault()));
    }

    private static InvalidStateException noAccount() {
        return new InvalidStateException("NO_ACCOUNT_YET", "This person has not created their account yet");
    }
}
