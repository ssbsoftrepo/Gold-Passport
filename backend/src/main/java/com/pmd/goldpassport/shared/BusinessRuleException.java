package com.pmd.goldpassport.shared;

import org.springframework.http.HttpStatus;

/** 422 - well-formed request that violates a business rule (missing requirements, no relationship...). */
public class BusinessRuleException extends ApiException {

    public BusinessRuleException(String code, String message) {
        super(HttpStatus.UNPROCESSABLE_CONTENT, code, message);
    }
}
