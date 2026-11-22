package com.pmd.goldpassport.identity.web;

import org.springframework.http.HttpStatus;

import com.pmd.goldpassport.identity.internal.IdentityProperties;
import com.pmd.goldpassport.shared.ApiException;

/** The PIN endpoints of local mode; in Cognito mode the apps use the Cognito user pool instead. */
final class LocalModeOnly {

    private LocalModeOnly() {
    }

    static void require(IdentityProperties props) {
        if (!props.isLocal()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_AVAILABLE",
                    "PINs are handled by Amazon Cognito in this environment") {
            };
        }
    }
}
