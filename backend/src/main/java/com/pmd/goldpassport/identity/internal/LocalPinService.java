package com.pmd.goldpassport.identity.internal;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.pmd.goldpassport.shared.ApiException;
import com.pmd.goldpassport.shared.BadRequestException;
import com.pmd.goldpassport.shared.Codes;
import com.pmd.goldpassport.shared.InvalidStateException;
import com.pmd.goldpassport.shared.Role;
import com.pmd.goldpassport.shared.UnauthorizedException;
import com.pmd.goldpassport.shared.Validators;

/**
 * Phone number + PIN sign-in in local auth mode (laptops, CI, demos). It behaves like the Amazon
 * Cognito user pool used in AWS: no SMS, wrong PINs lock the account for a while, and a PIN reset by
 * PMD is temporary and must be replaced at the next sign-in.
 */
@Service
public class LocalPinService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final BCryptPasswordEncoder BCRYPT = new BCryptPasswordEncoder(10);
    /** Compared against when the phone is unknown, so a wrong number takes as long as a wrong PIN. */
    private static final String DUMMY_HASH = BCRYPT.encode("not-a-real-pin");

    private final LocalCredentialRepository credentials;
    private final UserRepository userRepository;
    private final UserService users;
    private final LocalTokenIssuer tokens;
    private final IdentityProperties props;
    private final Clock clock;

    public LocalPinService(LocalCredentialRepository credentials, UserRepository userRepository, UserService users,
            LocalTokenIssuer tokens, IdentityProperties props, Clock clock) {
        this.credentials = credentials;
        this.userRepository = userRepository;
        this.users = users;
        this.tokens = tokens;
        this.props = props;
        this.clock = clock;
    }

    public record LoggedIn(String accessToken, long expiresInSeconds, User user) {
    }

    /** Creates the account for a phone number (or gives a PMD-created account its PIN). */
    @Transactional
    public LoggedIn signUp(String rawPhone, String pin) {
        String phone = requireValidPhone(rawPhone);
        Optional<User> existing = userRepository.findByPhone(phone);
        if (existing.isPresent() && credentials.existsById(existing.get().getId())) {
            throw new InvalidStateException("PHONE_ALREADY_REGISTERED", "This phone number already has an account");
        }
        requireAllowed(pin, existing.map(User::getRole).orElse(null));
        User user = existing.orElseGet(() -> users.findOrRegisterByPhone(phone));
        credentials.save(LocalCredential.create(user.getId(), BCRYPT.encode(pin), now()));
        return loggedIn(user);
    }

    /** {@code noRollbackFor} keeps the failed-attempt counter when the PIN is wrong. */
    @Transactional(noRollbackFor = {UnauthorizedException.class, InvalidStateException.class})
    public LoggedIn signIn(String rawPhone, String pin) {
        Account account = check(rawPhone, pin);
        if (account.credential().isMustChange()) {
            throw new InvalidStateException("PIN_CHANGE_REQUIRED", "Choose a new PIN to replace the temporary one");
        }
        return loggedIn(account.user());
    }

    /** Signs in with the temporary PIN from a PMD reset and replaces it with one the person chose. */
    @Transactional(noRollbackFor = {UnauthorizedException.class, InvalidStateException.class})
    public LoggedIn replaceTemporary(String rawPhone, String temporaryPin, String newPin) {
        Account account = check(rawPhone, temporaryPin);
        if (!account.credential().isMustChange()) {
            throw new InvalidStateException("PIN_CHANGE_NOT_REQUIRED", "This PIN is not temporary; sign in normally");
        }
        requireAllowed(newPin, account.user().getRole());
        if (newPin.equals(temporaryPin)) {
            throw new BadRequestException("PIN_NOT_ALLOWED", "Choose a PIN different from the temporary one");
        }
        account.credential().replace(BCRYPT.encode(newPin), now());
        return loggedIn(account.user());
    }

    /** Changes the PIN of a signed-in person, who must confirm the current one. */
    @Transactional(noRollbackFor = UnauthorizedException.class)
    public void change(UUID userId, String currentPin, String newPin) {
        User user = users.get(userId);
        LocalCredential credential = credentials.findById(userId)
                .orElseThrow(() -> new InvalidStateException("NO_PIN", "This account has no PIN yet"));
        verify(credential, currentPin);
        requireAllowed(newPin, user.getRole());
        credential.replace(BCRYPT.encode(newPin), now());
    }

    /** A PMD reset: a temporary PIN (staff: password) that must be replaced at the next sign-in. */
    @Transactional
    public PinResets.TemporaryPin reset(User target) {
        Instant now = now();
        Instant expiresAt = now.plus(props.temporaryPinTtlOrDefault());
        String temporary = temporaryFor(target.getRole());
        LocalCredential credential = credentials.findById(target.getId())
                .orElseGet(() -> LocalCredential.create(target.getId(), "", now));
        credential.resetTo(BCRYPT.encode(temporary), now, expiresAt);
        credentials.save(credential);
        return new PinResets.TemporaryPin(temporary, expiresAt);
    }

    /** A random temporary secret that passes the rules for {@code role}. */
    static String temporaryFor(Role role) {
        if (role == Role.ADMIN) {
            return Codes.random(12);
        }
        String pin;
        do {
            pin = String.format("%06d", RANDOM.nextInt(1_000_000));
        } while (!PinRules.isValidPin(pin));
        return pin;
    }

    private record Account(User user, LocalCredential credential) {
    }

    private Account check(String rawPhone, String pin) {
        String phone = requireValidPhone(rawPhone);
        Optional<User> user = userRepository.findByPhone(phone);
        Optional<LocalCredential> credential = user.flatMap(u -> credentials.findById(u.getId()));
        if (credential.isEmpty()) {
            BCRYPT.matches(pin == null ? "" : pin, DUMMY_HASH);
            throw invalidCredentials();
        }
        verify(credential.get(), pin);
        if (credential.get().isTemporaryExpired(now())) {
            throw new UnauthorizedException("TEMPORARY_PIN_EXPIRED", "The temporary PIN has expired. Ask PMD for a new one.");
        }
        if (!user.get().isActive()) {
            throw new UnauthorizedException("USER_SUSPENDED", "This account is suspended");
        }
        return new Account(user.get(), credential.get());
    }

    private void verify(LocalCredential credential, String pin) {
        Instant now = now();
        if (credential.isLocked(now)) {
            throw new TooManyAttempts();
        }
        if (pin == null || !BCRYPT.matches(pin, credential.getSecretHash())) {
            credential.recordFailure(now, props.local().maxAttempts(), props.local().lockout());
            credentials.save(credential);
            throw invalidCredentials();
        }
        credential.recordSuccess(now);
    }

    private LoggedIn loggedIn(User user) {
        return new LoggedIn(tokens.issue(user), tokens.ttlSeconds(), user);
    }

    private static void requireAllowed(String secret, Role role) {
        if (!PinRules.isAllowed(secret, role)) {
            throw role == Role.ADMIN
                    ? new BadRequestException("PASSWORD_TOO_SHORT",
                            "PMD staff need a password of at least " + PinRules.STAFF_PASSWORD_MIN_LENGTH + " characters")
                    : new BadRequestException("PIN_NOT_ALLOWED",
                            "The PIN must be 6 digits, not all the same and not a run like 123456");
        }
    }

    private static UnauthorizedException invalidCredentials() {
        return new UnauthorizedException("INVALID_CREDENTIALS", "The phone number or PIN is not correct");
    }

    private static String requireValidPhone(String rawPhone) {
        String phone = Validators.normalizePhone(rawPhone);
        if (!Validators.isE164(phone)) {
            throw new BadRequestException("INVALID_PHONE", "Phone must be in E.164 format, e.g. +51987654321");
        }
        return phone;
    }

    private Instant now() {
        return Instant.now(clock);
    }

    static class TooManyAttempts extends ApiException {
        TooManyAttempts() {
            super(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_ATTEMPTS", "Too many wrong PINs. Try again in a few minutes.");
        }
    }
}
