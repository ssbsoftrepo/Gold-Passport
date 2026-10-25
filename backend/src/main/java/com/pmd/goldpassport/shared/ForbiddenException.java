package com.pmd.goldpassport.shared;

import org.springframework.http.HttpStatus;

/** 403 - authenticated but not allowed (wrong role, not a participant, not approved yet). */
public class ForbiddenException extends ApiException {

    public ForbiddenException(String code, String message) {
        super(HttpStatus.FORBIDDEN, code, message);
    }
}
