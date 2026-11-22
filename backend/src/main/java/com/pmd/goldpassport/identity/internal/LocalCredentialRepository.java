package com.pmd.goldpassport.identity.internal;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface LocalCredentialRepository extends JpaRepository<LocalCredential, UUID> {
}
