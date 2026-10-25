package com.pmd.goldpassport.identity.internal;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.pmd.goldpassport.shared.Role;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByAuthSubject(String authSubject);

    Optional<User> findByPhone(String phone);

    List<User> findByRole(Role role);

    List<User> findByIdIn(Collection<UUID> ids);

    List<User> findAllByOrderByCreatedAtDesc();

    List<User> findByRoleOrderByCreatedAtDesc(Role role);
}
