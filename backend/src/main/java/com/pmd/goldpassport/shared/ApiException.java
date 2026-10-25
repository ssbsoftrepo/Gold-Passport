package com.pmd.goldpassport.shared;

import org.springframework.http.HttpStatus;

/**
 * Base class for business errors. Rendered as RFC 7807 problem details with a stable
 * {@code code} by the global exception handler.
 */
public abstract class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    protected ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }
}
