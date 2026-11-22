package com.pmd.goldpassport.identity.web;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.identity.internal.IdentityProperties;
import com.pmd.goldpassport.identity.internal.LocalPinService;
import com.pmd.goldpassport.identity.internal.PinResetService;
import com.pmd.goldpassport.identity.internal.PinResets;
import com.pmd.goldpassport.identity.internal.UserService;
import com.pmd.goldpassport.identity.web.IdentityDtos.ChangePinRequest;
import com.pmd.goldpassport.identity.web.IdentityDtos.SetRoleRequest;
import com.pmd.goldpassport.identity.web.IdentityDtos.TemporaryPinResponse;
import com.pmd.goldpassport.identity.web.IdentityDtos.UpdateProfileRequest;
import com.pmd.goldpassport.identity.web.IdentityDtos.UserProfile;
import com.pmd.goldpassport.shared.Role;

import jakarta.validation.Valid;

@RestController
class MeController {

    private final UserService users;
    private final LocalPinService pins;
    private final PinResetService resets;
    private final IdentityProperties props;

    MeController(UserService users, LocalPinService pins, PinResetService resets, IdentityProperties props) {
        this.users = users;
        this.pins = pins;
        this.resets = resets;
        this.props = props;
    }

    @GetMapping("/api/v1/me")
    UserProfile me(CurrentUser me) {
        return UserProfile.of(users.get(me.userId()));
    }

    @PatchMapping("/api/v1/me")
    UserProfile update(CurrentUser me, @Valid @RequestBody UpdateProfileRequest body) {
        return UserProfile.of(users.updateProfile(me, body.displayName(), body.email(), body.locale()));
    }

    @PutMapping("/api/v1/me/role")
    UserProfile setRole(CurrentUser me, @Valid @RequestBody SetRoleRequest body) {
        return UserProfile.of(users.chooseRole(me, body.role()));
    }

    /** Local mode only: in Cognito mode the apps change the password in Cognito (ChangePassword). */
    @PutMapping("/api/v1/me/pin")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void changePin(CurrentUser me, @Valid @RequestBody ChangePinRequest body) {
        LocalModeOnly.require(props);
        pins.change(me.userId(), body.currentPin(), body.newPin());
    }

    @PostMapping("/api/v1/admin/users/{userId}/reset-pin")
    TemporaryPinResponse resetPin(CurrentUser me, @PathVariable UUID userId) {
        PinResets.TemporaryPin temporary = resets.reset(me, userId);
        return new TemporaryPinResponse(temporary.value(), temporary.expiresAt());
    }

    @GetMapping("/api/v1/admin/users")
    List<UserProfile> adminList(CurrentUser me, @RequestParam(required = false) Role role) {
        me.requireRole(Role.ADMIN);
        return users.list(role).stream().map(UserProfile::of).toList();
    }
}
