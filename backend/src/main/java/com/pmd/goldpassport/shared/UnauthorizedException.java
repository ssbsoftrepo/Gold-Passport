package com.pmd.goldpassport.shared;

import org.springframework.http.HttpStatus;

/** 401 - missing, invalid or expired credentials (e.g. wrong OTP). */
public class UnauthorizedException extends ApiException {

    public UnauthorizedException(String code, String message) {
        super(HttpStatus.UNAUTHORIZED, code, message);
    }
}
