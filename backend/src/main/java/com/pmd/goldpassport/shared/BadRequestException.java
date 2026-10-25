package com.pmd.goldpassport.shared;

import org.springframework.http.HttpStatus;

/** 400 - invalid input that bean validation cannot express. */
public class BadRequestException extends ApiException {

    public BadRequestException(String code, String message) {
        super(HttpStatus.BAD_REQUEST, code, message);
    }
}
