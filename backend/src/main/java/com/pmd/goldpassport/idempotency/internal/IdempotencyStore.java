package com.pmd.goldpassport.idempotency.internal;

import java.time.Instant;
import java.util.UUID;

/** Remembers, per caller and key, whether a request is running and the response it produced. */
interface IdempotencyStore {

    sealed interface Outcome permits Started, Replay, InProgress, Mismatch {
    }

    /**
     * First time this key is seen (or a stale attempt was taken over): run the request. Only this
     * attempt may complete or release the key, so a late finish of a taken-over attempt is ignored.
     */
    record Started(UUID attemptId) implements Outcome {
    }

    /** The request already succeeded: answer with the stored response. */
    record Replay(int status, String contentType, byte[] body) implements Outcome {
    }

    /** Another attempt with this key is still running. */
    record InProgress() implements Outcome {
    }

    /** The key was used for a different operation. */
    record Mismatch() implements Outcome {
    }

    /**
     * Claims the key for this request.
     *
     * @param fingerprint identifies the operation (method and path); a key may not be reused for another
     * @param staleBefore a running attempt last touched before this instant may be taken over
     */
    Outcome begin(String owner, String key, String fingerprint, Instant now, Instant staleBefore);

    /** Stores the successful response so repeats get the same answer, if the attempt still owns the key. */
    void complete(String owner, String key, UUID attemptId, int status, String contentType, byte[] body,
            Instant now);

    /** Forgets a key whose request failed, if the attempt still owns it, so a retry runs the request again. */
    void release(String owner, String key, UUID attemptId);

    /** Deletes keys created before the instant; returns how many. */
    int purge(Instant createdBefore);
}
