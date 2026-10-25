package com.pmd.goldpassport.shared;

import org.springframework.http.HttpStatus;

/** 404 - the resource does not exist (or is deliberately hidden). */
public class NotFoundException extends ApiException {

    public NotFoundException(String what, Object id) {
        super(HttpStatus.NOT_FOUND, "NOT_FOUND", what + " not found: " + id);
    }
}
