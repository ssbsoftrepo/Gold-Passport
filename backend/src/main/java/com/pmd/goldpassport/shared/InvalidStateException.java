package com.pmd.goldpassport.shared;

import org.springframework.http.HttpStatus;

/** 409 - the action is not allowed in the aggregate's current state (state machine guard). */
public class InvalidStateException extends ApiException {

    public InvalidStateException(String message) {
        super(HttpStatus.CONFLICT, "INVALID_STATE", message);
    }

    public InvalidStateException(String code, String message) {
        super(HttpStatus.CONFLICT, code, message);
    }

    public static InvalidStateException of(String aggregate, Enum<?> current, String action) {
        return new InvalidStateException(aggregate + " in status " + current + " does not allow: " + action);
    }
}
