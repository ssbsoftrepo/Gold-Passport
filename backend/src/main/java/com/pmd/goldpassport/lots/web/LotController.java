package com.pmd.goldpassport.lots.web;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.pmd.goldpassport.identity.CurrentUser;
import com.pmd.goldpassport.identity.UserAccounts;
import com.pmd.goldpassport.lots.LotStatus;
import com.pmd.goldpassport.lots.internal.Lot;
import com.pmd.goldpassport.lots.internal.LotEvidence;
import com.pmd.goldpassport.lots.internal.LotService;
import com.pmd.goldpassport.monitoring.FieldSync;
import com.pmd.goldpassport.shared.Role;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@RestController
class LotController {

    private final LotService lots;
    private final UserAccounts users;
    private final FieldSync fieldSync;

    LotController(LotService lots, UserAccounts users, FieldSync fieldSync) {
        this.lots = lots;
        this.users = users;
        this.fieldSync = fieldSync;
    }

    record CreateLotRequest(@NotBlank @Size(max = 200) String mineSiteName, @Size(max = 2000) String description) {
    }

    record LotEvidenceDto(UUID id, UUID fileId, String sha256, double latitude, double longitude,
            Double accuracyMeters, Instant capturedAt, Instant receivedAt) {

        static LotEvidenceDto of(LotEvidence e) {
            return new LotEvidenceDto(e.getId(), e.getFileId(), e.getSha256(), e.getLatitude(), e.getLongitude(),
                    e.getAccuracyMeters(), e.getCapturedAt(), e.getReceivedAt());
        }
    }

    record LotDto(UUID id, String code, LotStatus status, UUID minerUserId, String minerName, String mineSiteName,
            String description, UUID transporterUserId, UUID collectorUserId, UUID custodianUserId, Role custodianRole,
            UUID currentTransportId, BigDecimal declaredWeightGrams, BigDecimal declaredPurityPct, String minerLabName,
            UUID minerLabReportFileId, BigDecimal verifiedWeightGrams, BigDecimal verifiedPurityPct,
            List<LotEvidenceDto> evidence, Instant createdAt, Instant completedAt, Instant updatedAt) {
    }

    @GetMapping("/api/v1/lots")
    List<LotDto> mine(CurrentUser me, @RequestParam(required = false) LotStatus status) {
        return toDtos(lots.listFor(me, status));
    }

    @PostMapping("/api/v1/lots")
    @ResponseStatus(HttpStatus.CREATED)
    LotDto create(CurrentUser me, @Valid @RequestBody CreateLotRequest body) {
        return toDto(lots.create(me, body.mineSiteName(), body.description()));
    }

    @GetMapping("/api/v1/lots/{lotId}")
    LotDto get(CurrentUser me, @PathVariable UUID lotId) {
        return toDto(lots.getReadable(me, lotId));
    }

    @PostMapping(path = "/api/v1/lots/{lotId}/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    LotEvidenceDto uploadPhoto(CurrentUser me, @PathVariable UUID lotId,
            @RequestPart("file") MultipartFile file,
            @RequestParam("latitude") double latitude,
            @RequestParam("longitude") double longitude,
            @RequestParam(value = "accuracyMeters", required = false) Double accuracyMeters,
            @RequestParam(value = "capturedAt", required = false) Instant capturedAt) {
        LotEvidence saved = lots.addPhoto(me, lotId, file, latitude, longitude, accuracyMeters, capturedAt);
        fieldSync.arrived(FieldSync.PHOTO, capturedAt);
        return LotEvidenceDto.of(saved);
    }

    @PostMapping("/api/v1/lots/{lotId}/complete")
    LotDto complete(CurrentUser me, @PathVariable UUID lotId) {
        return toDto(lots.complete(me, lotId));
    }

    @PostMapping(path = "/api/v1/lots/{lotId}/miner-lab-result", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    LotDto minerLabResult(CurrentUser me, @PathVariable UUID lotId,
            @RequestPart("file") MultipartFile file,
            @RequestParam("purityPct") BigDecimal purityPct,
            @RequestParam("weightGrams") BigDecimal weightGrams,
            @RequestParam("labName") String labName) {
        return toDto(lots.declareMinerLab(me, lotId, file, purityPct, weightGrams, labName));
    }

    @GetMapping("/api/v1/admin/lots")
    List<LotDto> adminList(@RequestParam(required = false) LotStatus status) {
        return toDtos(lots.listAll(status));
    }

    private LotDto toDto(Lot lot) {
        return toDtos(List.of(lot)).get(0);
    }

    private List<LotDto> toDtos(Collection<Lot> list) {
        Map<UUID, String> names = users.displayNames(list.stream().map(Lot::getMinerUserId).toList());
        return list.stream().map(l -> new LotDto(l.getId(), l.getCode(), l.getStatus(), l.getMinerUserId(),
                names.get(l.getMinerUserId()), l.getMineSiteName(), l.getDescription(), l.getTransporterUserId(),
                l.getCollectorUserId(), l.getCustodianUserId(), l.getCustodianRole(), l.getCurrentTransportId(),
                l.getDeclaredWeightGrams(), l.getDeclaredPurityPct(), l.getMinerLabName(), l.getMinerLabReportFileId(),
                l.getVerifiedWeightGrams(), l.getVerifiedPurityPct(),
                l.getEvidence().stream().map(LotEvidenceDto::of).toList(),
                l.getCreatedAt(), l.getCompletedAt(), l.getUpdatedAt())).toList();
    }
}
