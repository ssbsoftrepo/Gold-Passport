package com.pmd.goldpassport.relationships;

import java.util.UUID;

/** Public API of the relationships module. */
public interface RelationshipQueries {

    /** True if an APPROVED commercial relationship exists between the two users, in either direction. */
    boolean hasApprovedRelationship(UUID userA, UUID userB);
}
