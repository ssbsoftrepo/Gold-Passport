package com.pmd.goldpassport.identity.security;

import java.util.Collection;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

import com.pmd.goldpassport.identity.CurrentUser;

/** Authentication whose principal is the platform {@link CurrentUser}. */
public class PmdAuthenticationToken extends AbstractAuthenticationToken {

    private final Jwt jwt;
    private final CurrentUser user;

    public PmdAuthenticationToken(Jwt jwt, CurrentUser user, Collection<? extends GrantedAuthority> authorities) {
        super(authorities);
        this.jwt = jwt;
        this.user = user;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return jwt;
    }

    @Override
    public Object getPrincipal() {
        return user;
    }

    @Override
    public String getName() {
        return user.userId().toString();
    }
}
