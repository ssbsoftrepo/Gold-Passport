package com.pmd.goldpassport.transport.web;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.identity.UserAccounts;
import com.pmd.goldpassport.transport.internal.CheckpointType;
import com.pmd.goldpassport.transport.internal.Transport;
import com.pmd.goldpassport.transport.internal.TransportCheckpoint;
import com.pmd.goldpassport.transport.internal.TransportService;
import com.pmd.goldpassport.transport.internal.TransportStatus;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@RestController
class TransportController {

    private final TransportService transports;
    private final UserAccounts users;

    TransportController(TransportService transports, UserAccounts users) {
        this.transports = transports;
        this.users = users;
    }

    record TransportRequest(@NotNull UUID minerUserId, @NotNull UUID collectorUserId, LocalDate plannedPickupDate,
            @Size(max = 2000) String notes) {
    }

    record MinerConfirmRequest(@NotNull UUID lotId) {
    }

    record ReasonRequest(@NotBlank @Size(max = 2000) String reason) {
    }

    record GeoReading(
            @NotNull @DecimalMin("-90") @DecimalMax("90") Double latitude,
            @NotNull @DecimalMin("-180") @DecimalMax("180") Double longitude,
            Double accuracyMeters,
            Instant recordedAt) {

        TransportService.Reading toReading() {
            return new TransportService.Reading(latitude, longitude, accuracyMeters, recordedAt);
        }
    }

    record CheckpointDto(UUID id, CheckpointType type, double latitude, double longitude, Double accuracyMeters,
            Instant recordedAt, Instant receivedAt) {

        static CheckpointDto of(TransportCheckpoint c) {
            return new CheckpointDto(c.getId(), c.getType(), c.getLatitude(), c.getLongitude(), c.getAccuracyMeters(),
                    c.getRecordedAt(), c.getReceivedAt());
        }
    }

    record TransportDto(UUID id, String code, TransportStatus status, UUID transporterUserId, String transporterName,
            UUID minerUserId, String minerName, UUID collectorUserId, String collectorName, UUID lotId, String lotCode,
            LocalDate plannedPickupDate, String notes, Instant minerConfirmedAt, Instant collectorConfirmedAt,
            UUID declinedByUserId, String declineReason, Instant pickupApprovedAt, Instant handoverConfirmedAt,
            Double arrivalDistanceKm, boolean locationMismatch, List<CheckpointDto> checkpoints, Instant createdAt,
            Instant updatedAt, Instant completedAt) {
    }

    @GetMapping("/api/v1/transports")
    List<TransportDto> mine(CurrentUser me, @RequestParam(required = false) TransportStatus status) {
        return toDtos(transports.listFor(me, status));
    }

    @PostMapping("/api/v1/transports")
    @ResponseStatus(HttpStatus.CREATED)
    TransportDto create(CurrentUser me, @Valid @RequestBody TransportRequest body) {
        return toDto(transports.create(me, body.minerUserId(), body.collectorUserId(), body.plannedPickupDate(), body.notes()));
    }

    @GetMapping("/api/v1/transports/{transportId}")
    TransportDto get(CurrentUser me, @PathVariable UUID transportId) {
        return toDto(transports.getReadable(me, transportId));
    }

    @PutMapping("/api/v1/transports/{transportId}")
    TransportDto amend(CurrentUser me, @PathVariable UUID transportId, @Valid @RequestBody TransportRequest body) {
        return toDto(transports.amend(me, transportId, body.minerUserId(), body.collectorUserId(),
                body.plannedPickupDate(), body.notes()));
    }

    @PostMapping("/api/v1/transports/{transportId}/miner-confirm")
    TransportDto minerConfirm(CurrentUser me, @PathVariable UUID transportId,
            @Valid @RequestBody MinerConfirmRequest body) {
        return toDto(transports.minerConfirm(me, transportId, body.lotId()));
    }

    @PostMapping("/api/v1/transports/{transportId}/collector-confirm")
    TransportDto collectorConfirm(CurrentUser me, @PathVariable UUID transportId) {
        return toDto(transports.collectorConfirm(me, transportId));
    }

    @PostMapping("/api/v1/transports/{transportId}/decline")
    TransportDto decline(CurrentUser me, @PathVariable UUID transportId, @Valid @RequestBody ReasonRequest body) {
        return toDto(transports.decline(me, transportId, body.reason()));
    }

    @PostMapping("/api/v1/transports/{transportId}/cancel")
    TransportDto cancel(CurrentUser me, @PathVariable UUID transportId, @Valid @RequestBody ReasonRequest body) {
        return toDto(transports.cancel(me, transportId, body.reason()));
    }

    @PostMapping("/api/v1/transports/{transportId}/depart")
    TransportDto depart(CurrentUser me, @PathVariable UUID transportId, @Valid @RequestBody GeoReading body) {
        return toDto(transports.depart(me, transportId, body.toReading()));
    }

    @PostMapping("/api/v1/transports/{transportId}/arrive-at-miner")
    TransportDto arriveAtMiner(CurrentUser me, @PathVariable UUID transportId, @Valid @RequestBody GeoReading body) {
        return toDto(transports.arriveAtMiner(me, transportId, body.toReading()));
    }

    @PostMapping("/api/v1/transports/{transportId}/approve-pickup")
    TransportDto approvePickup(CurrentUser me, @PathVariable UUID transportId) {
        return toDto(transports.approvePickup(me, transportId));
    }

    @PostMapping("/api/v1/transports/{transportId}/handover")
    TransportDto handover(CurrentUser me, @PathVariable UUID transportId) {
        return toDto(transports.confirmHandover(me, transportId));
    }

    @PostMapping("/api/v1/transports/{transportId}/pickup")
    TransportDto pickup(CurrentUser me, @PathVariable UUID transportId, @Valid @RequestBody GeoReading body) {
        return toDto(transports.pickUp(me, transportId, body.toReading()));
    }

    @PostMapping("/api/v1/transports/{transportId}/location")
    TransportDto location(CurrentUser me, @PathVariable UUID transportId, @Valid @RequestBody GeoReading body) {
        return toDto(transports.recordLocation(me, transportId, body.toReading()));
    }

    @PostMapping("/api/v1/transports/{transportId}/arrive-at-collector")
    TransportDto arriveAtCollector(CurrentUser me, @PathVariable UUID transportId,
            @Valid @RequestBody GeoReading body) {
        return toDto(transports.arriveAtCollector(me, transportId, body.toReading()));
    }

    @PostMapping("/api/v1/transports/{transportId}/receive")
    TransportDto receive(CurrentUser me, @PathVariable UUID transportId) {
        return toDto(transports.receive(me, transportId));
    }

    @PostMapping("/api/v1/transports/{transportId}/finalize")
    TransportDto finalizeTransport(CurrentUser me, @PathVariable UUID transportId) {
        return toDto(transports.close(me, transportId));
    }

    @GetMapping("/api/v1/admin/transports")
    List<TransportDto> adminList(@RequestParam(required = false) TransportStatus status) {
        return toDtos(transports.listAll(status));
    }

    private TransportDto toDto(Transport t) {
        return toDtos(List.of(t)).get(0);
    }

    private List<TransportDto> toDtos(Collection<Transport> list) {
        List<UUID> ids = new ArrayList<>();
        for (Transport t : list) {
            ids.add(t.getTransporterUserId());
            ids.add(t.getMinerUserId());
            ids.add(t.getCollectorUserId());
        }
        Map<UUID, String> names = users.displayNames(ids);
        return list.stream().map(t -> new TransportDto(t.getId(), t.getCode(), t.getStatus(),
                t.getTransporterUserId(), names.get(t.getTransporterUserId()),
                t.getMinerUserId(), names.get(t.getMinerUserId()),
                t.getCollectorUserId(), names.get(t.getCollectorUserId()),
                t.getLotId(), t.getLotCode(), t.getPlannedPickupDate(), t.getNotes(),
                t.getMinerConfirmedAt(), t.getCollectorConfirmedAt(), t.getDeclinedByUserId(), t.getDeclineReason(),
                t.getPickupApprovedAt(), t.getHandoverConfirmedAt(), t.getArrivalDistanceKm(), t.isLocationMismatch(),
                t.getCheckpoints().stream().map(CheckpointDto::of).toList(),
                t.getCreatedAt(), t.getUpdatedAt(), t.getCompletedAt())).toList();
    }
}
