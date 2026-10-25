package com.pmd.goldpassport.lots.internal;

import java.util.UUID;

import org.springframework.stereotype.Component;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.lots.LotCustody;
import com.pmd.goldpassport.storage.FileAccessPolicy;

/** Lot files (photos, lab reports) are visible to the lot's miner, transporter and collector. */
@Component
class LotFileAccessPolicy implements FileAccessPolicy {

    private final LotRepository lots;

    LotFileAccessPolicy(LotRepository lots) {
        this.lots = lots;
    }

    @Override
    public String contextType() {
        return LotCustody.FILE_CONTEXT;
    }

    @Override
    public boolean canRead(CurrentUser user, UUID lotId) {
        return lots.findById(lotId).map(l -> l.toView().isParticipant(user.userId())).orElse(false);
    }
}
