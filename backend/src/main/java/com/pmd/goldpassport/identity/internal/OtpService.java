package com.pmd.goldpassport.identity.internal;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.pmd.goldpassport.shared.ApiException;
import com.pmd.goldpassport.shared.BadRequestException;
import com.pmd.goldpassport.shared.Hashing;
import com.pmd.goldpassport.shared.UnauthorizedException;
import com.pmd.goldpassport.shared.Validators;

import org.springframework.http.HttpStatus;

/**
 * Local-mode OTP login. Codes are written to the application log instead of being sent by SMS;
 * production uses Amazon Cognito, which sends the SMS itself.
 */
@Service
public class OtpService {

    private static final Logger log = LoggerFactory.getLogger(OtpService.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final OtpChallengeRepository challenges;
    private final UserService users;
    private final LocalTokenIssuer tokens;
    private final IdentityProperties props;
    private final Clock clock;

    public OtpService(OtpChallengeRepository challenges, UserService users, LocalTokenIssuer tokens,
            IdentityProperties props, Clock clock) {
        this.challenges = challenges;
        this.users = users;
        this.tokens = tokens;
        this.props = props;
        this.clock = clock;
    }

    public record Issued(long expiresInSeconds, String devCode) {
    }

    public record LoggedIn(String accessToken, long expiresInSeconds, User user) {
    }

    @Transactional
    public Issued request(String rawPhone) {
        String phone = requireValidPhone(rawPhone);
        IdentityProperties.Local cfg = props.local();
        Instant now = Instant.now(clock);
        long recent = challenges.countByPhoneAndCreatedAtAfter(phone, now.minus(cfg.requestWindow()));
        if (recent >= cfg.maxRequestsPerWindow()) {
            throw new TooManyRequests();
        }
        String code = (cfg.fixedOtp() != null && !cfg.fixedOtp().isBlank())
                ? cfg.fixedOtp()
                : String.format("%06d", RANDOM.nextInt(1_000_000));
        challenges.save(OtpChallenge.issue(phone, hash(phone, code), now, now.plus(cfg.otpTtl())));
        log.info("[local-auth] OTP for {} is {} (valid {}s)", phone, code, cfg.otpTtl().toSeconds());
        return new Issued(cfg.otpTtl().toSeconds(), cfg.exposeCode() ? code : null);
    }

    /** {@code noRollbackFor} keeps the failed-attempt counter when the code is wrong. */
    @Transactional(noRollbackFor = UnauthorizedException.class)
    public LoggedIn verify(String rawPhone, String code) {
        String phone = requireValidPhone(rawPhone);
        Instant now = Instant.now(clock);
        OtpChallenge challenge = challenges.findFirstByPhoneOrderByCreatedAtDesc(phone)
                .filter(c -> c.isUsable(now, props.local().maxAttempts()))
                .orElseThrow(() -> new UnauthorizedException("OTP_EXPIRED", "No valid code for this phone. Request a new one."));
        byte[] expected = challenge.getCodeHash().getBytes(StandardCharsets.UTF_8);
        byte[] actual = hash(phone, code == null ? "" : code.trim()).getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(expected, actual)) {
            challenge.recordFailedAttempt();
            throw new UnauthorizedException("OTP_INVALID", "The code is not correct");
        }
        challenge.consume(now);
        User user = users.findOrRegisterByPhone(phone);
        if (!user.isActive()) {
            throw new UnauthorizedException("USER_SUSPENDED", "This account is suspended");
        }
        return new LoggedIn(tokens.issue(user), tokens.ttlSeconds(), user);
    }

    private static String requireValidPhone(String rawPhone) {
        String phone = Validators.normalizePhone(rawPhone);
        if (!Validators.isE164(phone)) {
            throw new BadRequestException("INVALID_PHONE", "Phone must be in E.164 format, e.g. +51987654321");
        }
        return phone;
    }

    private static String hash(String phone, String code) {
        return Hashing.sha256Hex(phone + ":" + code);
    }

    static class TooManyRequests extends ApiException {
        TooManyRequests() {
            super(HttpStatus.TOO_MANY_REQUESTS, "OTP_RATE_LIMITED", "Too many code requests. Try again later.");
        }
    }
}
