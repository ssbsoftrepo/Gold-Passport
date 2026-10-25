package com.pmd.goldpassport.identity.security;

import java.util.List;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.identity.internal.User;
import com.pmd.goldpassport.identity.internal.UserService;
import com.pmd.goldpassport.shared.ApiException;

/**
 * Turns a validated JWT into a {@link PmdAuthenticationToken}. The role always comes from our
 * database (not from token claims), so PMD controls authorization regardless of the identity
 * provider.
 */
@Component
class PmdJwtAuthenticationConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    private final UserService users;

    PmdJwtAuthenticationConverter(UserService users) {
        this.users = users;
    }

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        String phone = jwt.getClaimAsString("phone_number");
        if (phone == null) {
            // Cognito access tokens carry the username (we use the phone number as username).
            phone = jwt.getClaimAsString("username");
        }
        User user;
        try {
            user = users.resolveFromToken(jwt.getSubject(), phone);
        } catch (ApiException e) {
            throw new BadCredentialsException(e.getMessage(), e);
        }
        if (!user.isActive()) {
            throw new DisabledException("Account suspended");
        }
        CurrentUser current = new CurrentUser(user.getId(), user.getPhone(), user.getRole());
        String authority = user.getRole() == null ? "ROLE_UNASSIGNED" : "ROLE_" + user.getRole().name();
        return new PmdAuthenticationToken(jwt, current, List.of(new SimpleGrantedAuthority(authority)));
    }
}
