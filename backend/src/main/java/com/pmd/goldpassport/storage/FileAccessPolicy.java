package com.pmd.goldpassport.storage;

import java.util.UUID;

import com.pmd.goldpassport.identity.CurrentUser;

/**
 * Extension point: modules that store files register a policy deciding who may download them.
 * Admins and the uploader can always read a file; everyone else is asked here.
 */
public interface FileAccessPolicy {

    String contextType();

    boolean canRead(CurrentUser user, UUID contextId);
}
