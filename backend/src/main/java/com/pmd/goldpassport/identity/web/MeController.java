package com.pmd.goldpassport.identity.web;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.identity.internal.UserService;
import com.pmd.goldpassport.identity.web.IdentityDtos.SetRoleRequest;
import com.pmd.goldpassport.identity.web.IdentityDtos.UpdateProfileRequest;
import com.pmd.goldpassport.identity.web.IdentityDtos.UserProfile;
import com.pmd.goldpassport.shared.Role;

import jakarta.validation.Valid;

@RestController
class MeController {

    private final UserService users;

    MeController(UserService users) {
        this.users = users;
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

    @GetMapping("/api/v1/admin/users")
    List<UserProfile> adminList(CurrentUser me, @RequestParam(required = false) Role role) {
        me.requireRole(Role.ADMIN);
        return users.list(role).stream().map(UserProfile::of).toList();
    }
}
