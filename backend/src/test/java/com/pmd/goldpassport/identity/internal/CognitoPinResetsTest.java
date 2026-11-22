package com.pmd.goldpassport.identity.internal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.function.Consumer;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.pmd.goldpassport.shared.InvalidStateException;
import com.pmd.goldpassport.shared.Role;

import software.amazon.awssdk.services.cognitoidentityprovider.CognitoIdentityProviderClient;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminSetUserPasswordRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.UserNotFoundException;

class CognitoPinResetsTest {

    private final Instant now = Instant.parse("2026-11-22T10:00:00Z");
    private final CognitoIdentityProviderClient cognito = mock(CognitoIdentityProviderClient.class);
    private final IdentityProperties props = new IdentityProperties("cognito", null,
            new IdentityProperties.Cognito("https://issuer", "sa-east-1", "client", "pool-1"), Duration.ofDays(7), List.of());
    private final CognitoPinResets resets = new CognitoPinResets(cognito, "pool-1", props, Clock.fixed(now, ZoneOffset.UTC));

    private static User user(Role role, boolean signedInBefore) {
        User u = User.register("+51987650011", null, Instant.EPOCH);
        if (signedInBefore) {
            u.linkSubject("cognito-sub-1", Instant.EPOCH);
        }
        if (role != null) {
            u.chooseRole(role, Instant.EPOCH);
        }
        return u;
    }

    @SuppressWarnings("unchecked")
    @Test
    void setsATemporaryPasswordAndSignsTheAccountOutEverywhere() {
        PinResets.TemporaryPin pin = resets.reset(user(Role.MINER, true));

        ArgumentCaptor<Consumer<AdminSetUserPasswordRequest.Builder>> set = ArgumentCaptor.forClass(Consumer.class);
        verify(cognito).adminSetUserPassword(set.capture());
        AdminSetUserPasswordRequest.Builder b = AdminSetUserPasswordRequest.builder();
        set.getValue().accept(b);
        AdminSetUserPasswordRequest request = b.build();
        assertThat(request.userPoolId()).isEqualTo("pool-1");
        assertThat(request.username()).isEqualTo("cognito-sub-1");
        assertThat(request.permanent()).isFalse();
        assertThat(request.password()).isEqualTo(pin.value()).matches("\\d{6}");
        verify(cognito).adminUserGlobalSignOut(any(Consumer.class));
        assertThat(pin.expiresAt()).isEqualTo(now.plus(Duration.ofDays(7)));
    }

    @SuppressWarnings("unchecked")
    @Test
    void refusesAccountsNobodyCreatedYet() {
        assertThatThrownBy(() -> resets.reset(user(null, false)))
                .isInstanceOf(InvalidStateException.class).hasMessageContaining("not created");
        verify(cognito, never()).adminSetUserPassword(any(Consumer.class));

        when(cognito.adminSetUserPassword(any(Consumer.class))).thenThrow(UserNotFoundException.builder().build());
        assertThatThrownBy(() -> resets.reset(user(Role.MINER, true))).isInstanceOf(InvalidStateException.class);
        verify(cognito, never()).adminUserGlobalSignOut(any(Consumer.class));
    }
}
