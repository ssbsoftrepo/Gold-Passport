package com.pmd.goldpassport.notifications.internal;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import com.pmd.goldpassport.identity.UserAccounts;
import com.pmd.goldpassport.lab.LabEvent;
import com.pmd.goldpassport.onboarding.OnboardingEvent;
import com.pmd.goldpassport.relationships.RelationshipEvent;
import com.pmd.goldpassport.settlement.SettlementEvent;
import com.pmd.goldpassport.shared.Role;
import com.pmd.goldpassport.transport.TransportEvent;

/**
 * Decides who hears about what. Listeners run asynchronously after the business transaction
 * commits; Spring Modulith's event publication registry re-delivers them if the app crashes.
 *
 * <p>Unlike {@code @ApplicationModuleListener}, they do not open a transaction around the whole
 * listener: {@link NotificationService#notify} saves the inbox entries in its own short transaction
 * and sends push notifications after it, so no pooled database connection waits on Amazon SNS.
 */
@Component
public class NotificationListeners {

    private final NotificationService notifications;
    private final UserAccounts users;

    public NotificationListeners(NotificationService notifications, UserAccounts users) {
        this.notifications = notifications;
        this.users = users;
    }

    @Async
    @TransactionalEventListener
    public void on(OnboardingEvent e) {
        Object[] args = {"", "", e.details().getOrDefault("notes", "")};
        Map<String, String> data = Map.of("applicationId", e.applicationId().toString());
        switch (e.kind()) {
            case SUBMITTED -> notifications.notify(admins(), e.eventType(), args, data);
            case APPROVED, CORRECTIONS_REQUESTED, REJECTED ->
                    notifications.notify(List.of(e.applicantUserId()), e.eventType(), args, data);
            default -> {
                // KYC_COMPLETED is only recorded in the ledger
            }
        }
    }

    @Async
    @TransactionalEventListener
    public void on(RelationshipEvent e) {
        Object[] args = {"", "", e.details().getOrDefault("notes", "")};
        Map<String, String> data = Map.of("relationshipId", e.relationshipId().toString());
        switch (e.kind()) {
            case SUBMITTED -> notifications.notify(admins(), e.eventType(), args, data);
            case APPROVED -> {
                notifications.notify(List.of(e.ownerUserId()), e.eventType(), args, data);
                if (e.counterpartyUserId() != null) {
                    notifications.notify(List.of(e.counterpartyUserId()), "relationship.ADDED_AS_PARTNER", args, data);
                }
            }
            case CLARIFICATION_REQUESTED, REJECTED ->
                    notifications.notify(List.of(e.ownerUserId()), e.eventType(), args, data);
        }
    }

    @Async
    @TransactionalEventListener
    public void on(TransportEvent e) {
        UUID transporter = e.transporterUserId();
        UUID miner = e.minerUserId();
        UUID collector = e.collectorUserId();
        List<UUID> to = switch (e.kind()) {
            case REQUESTED, AMENDED, CANCELLED, DEPARTED, ARRIVED_AT_MINER, PICKED_UP -> List.of(miner, collector);
            case MINER_CONFIRMED -> List.of(transporter, collector);
            case COLLECTOR_CONFIRMED -> List.of(transporter, miner);
            case CONFIRMED, PICKUP_APPROVED, HANDOVER_CONFIRMED -> List.of(transporter);
            case DECLINED -> List.of(transporter, miner, collector);
            case ARRIVED_AT_COLLECTOR -> List.of(collector);
            case DELIVERED -> List.of(transporter, miner);
            case LOCATION_RECORDED, COMPLETED -> List.of();
        };
        if (to.isEmpty()) {
            return;
        }
        List<UUID> recipients = new ArrayList<>(to);
        if (e.actorUserId() != null && e.kind() != TransportEvent.Kind.CONFIRMED) {
            recipients.remove(e.actorUserId());
        }
        Map<String, String> data = new HashMap<>();
        data.put("transportId", e.transportId().toString());
        if (e.lotId() != null) {
            data.put("lotId", e.lotId().toString());
        }
        Object[] args = {e.details().getOrDefault("lotCode", ""), e.transportCode(), e.details().getOrDefault("reason", "")};
        notifications.notify(recipients, e.eventType(), args, data);
    }

    @Async
    @TransactionalEventListener
    public void on(LabEvent e) {
        Map<String, String> data = Map.of("lotId", e.lotId().toString());
        Object[] args = {e.lotCode(), "", ""};
        List<UUID> parties = List.of(e.minerUserId(), e.collectorUserId());
        switch (e.kind()) {
            case RESULT_APPROVED, DISCREPANCY_RESOLVED -> notifications.notify(parties, e.eventType(), args, data);
            case DISCREPANCY_DETECTED -> {
                List<UUID> all = new ArrayList<>(parties);
                all.addAll(admins());
                notifications.notify(all, e.eventType(), args, data);
            }
        }
    }

    @Async
    @TransactionalEventListener
    public void on(SettlementEvent e) {
        Map<String, String> data = Map.of("lotId", e.lotId().toString());
        Object amount = e.details().getOrDefault("amount", "");
        Object currency = e.details().getOrDefault("currency", "");
        Object reason = e.details().getOrDefault("reason", "");
        Object[] args = {e.lotCode(), "", amount + " " + currency, reason};
        switch (e.kind()) {
            case PROPOSED, PAID -> notifications.notify(List.of(e.minerUserId()), e.eventType(), args, data);
            case ACCEPTED -> {
                List<UUID> to = new ArrayList<>(admins());
                to.add(e.collectorUserId());
                notifications.notify(to, e.eventType(), args, data);
            }
            case DISPUTED -> notifications.notify(List.of(e.collectorUserId()), e.eventType(), args, data);
            case VALIDATED, REJECTED_BY_PMD ->
                    notifications.notify(List.of(e.minerUserId(), e.collectorUserId()), e.eventType(), args, data);
        }
    }

    private List<UUID> admins() {
        return users.userIdsWithRole(Role.ADMIN);
    }
}
