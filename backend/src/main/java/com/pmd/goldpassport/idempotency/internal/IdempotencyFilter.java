package com.pmd.goldpassport.idempotency.internal;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingResponseWrapper;

import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Makes {@code POST} requests carrying an {@code Idempotency-Key} header safe to repeat.
 *
 * <p>On a weak signal the phone often sends a request that reaches the server while the answer is
 * lost. The offline outbox then sends it again. With the same key, the repeat gets the first
 * response back (marked {@code Idempotent-Replayed: true}) instead of storing a second photo or being
 * refused because the transport step already happened.
 *
 * <ul>
 *   <li>Keys are scoped to the authenticated user; anonymous requests are passed through.</li>
 *   <li>Only successful (2xx) responses are remembered. After a failure the key is released, so a
 *       retry runs the request again (nothing was changed by the failed attempt).</li>
 *   <li>While the first attempt is still running, repeats get {@code 409 IDEMPOTENCY_KEY_IN_USE}
 *       with {@code Retry-After}; reusing a key for another operation gets
 *       {@code 422 IDEMPOTENCY_KEY_REUSED}.</li>
 * </ul>
 *
 * <p>Runs after the Spring Security filter chain (default filter order), so the caller is known.
 */
@Component
class IdempotencyFilter extends OncePerRequestFilter {

    static final String HEADER = "Idempotency-Key";
    static final String REPLAYED_HEADER = "Idempotent-Replayed";
    private static final Pattern VALID_KEY = Pattern.compile("[A-Za-z0-9._:-]{1,128}");
    private static final Logger log = LoggerFactory.getLogger(IdempotencyFilter.class);

    private final IdempotencyStore store;
    private final IdempotencyProperties props;
    private final Clock clock;
    private final ObjectMapper json;

    IdempotencyFilter(IdempotencyStore store, IdempotencyProperties props, Clock clock, ObjectMapper json) {
        this.store = store;
        this.props = props;
        this.clock = clock;
        this.json = json;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod())
                || request.getHeader(HEADER) == null
                || !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String owner = currentOwner();
        if (owner == null) {
            chain.doFilter(request, response);
            return;
        }
        String key = request.getHeader(HEADER).trim();
        if (!VALID_KEY.matcher(key).matches()) {
            problem(response, HttpStatus.BAD_REQUEST, "IDEMPOTENCY_KEY_INVALID",
                    "Idempotency-Key must be 1-128 characters: letters, digits, '.', '_', ':' or '-'");
            return;
        }
        String fingerprint = request.getMethod() + " " + request.getRequestURI();
        Instant now = clock.instant();
        switch (store.begin(owner, key, fingerprint, now, now.minus(props.inProgressTimeout()))) {
            case IdempotencyStore.Started started -> execute(request, response, chain, owner, key);
            case IdempotencyStore.Replay replay -> replay(response, replay);
            case IdempotencyStore.InProgress inProgress -> {
                response.setHeader("Retry-After", "5");
                problem(response, HttpStatus.CONFLICT, "IDEMPOTENCY_KEY_IN_USE",
                        "This request is still being processed. Try again shortly.");
            }
            case IdempotencyStore.Mismatch mismatch -> problem(response, HttpStatus.UNPROCESSABLE_ENTITY,
                    "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used for a different request.");
        }
    }

    private void execute(HttpServletRequest request, HttpServletResponse response, FilterChain chain, String owner,
            String key) throws ServletException, IOException {
        ContentCachingResponseWrapper wrapper = new ContentCachingResponseWrapper(response);
        boolean remembered = false;
        try {
            chain.doFilter(request, wrapper);
            int status = wrapper.getStatus();
            if (status >= 200 && status < 300) {
                try {
                    store.complete(owner, key, status, wrapper.getContentType(), wrapper.getContentAsByteArray(),
                            clock.instant());
                    remembered = true;
                } catch (RuntimeException e) {
                    // The change is committed; answer normally. A repeat would run it again.
                    log.warn("Could not store the response for idempotency key {}", key, e);
                }
            }
        } finally {
            if (!remembered) {
                try {
                    store.release(owner, key);
                } catch (RuntimeException e) {
                    log.warn("Could not release idempotency key {}", key, e);
                }
            }
            wrapper.copyBodyToResponse();
        }
    }

    private static void replay(HttpServletResponse response, IdempotencyStore.Replay replay) throws IOException {
        response.setStatus(replay.status());
        if (replay.contentType() != null) {
            response.setContentType(replay.contentType());
        }
        response.setHeader(REPLAYED_HEADER, "true");
        response.setContentLength(replay.body().length);
        response.getOutputStream().write(replay.body());
    }

    private void problem(HttpServletResponse response, HttpStatus status, String code, String detail)
            throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", "about:blank");
        body.put("title", status.getReasonPhrase());
        body.put("status", status.value());
        body.put("detail", detail);
        body.put("code", code);
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        json.writeValue(response.getOutputStream(), body);
    }

    private static String currentOwner() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) {
            return null;
        }
        return auth.getName();
    }
}
