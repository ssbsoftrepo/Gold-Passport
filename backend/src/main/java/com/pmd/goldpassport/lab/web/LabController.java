package com.pmd.goldpassport.lab.web;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
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
import com.pmd.goldpassport.lab.internal.LabResult;
import com.pmd.goldpassport.lab.internal.LabResultStatus;
import com.pmd.goldpassport.lab.internal.LabService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@RestController
class LabController {

    private final LabService lab;

    LabController(LabService lab) {
        this.lab = lab;
    }

    record LabResultDto(UUID id, UUID lotId, String lotCode, UUID collectorUserId, String labName,
            BigDecimal measuredPurityPct, BigDecimal measuredWeightGrams, BigDecimal declaredPurityPct,
            BigDecimal declaredWeightGrams, BigDecimal purityDeltaPct, BigDecimal weightDeltaPct,
            LabResultStatus status, UUID reportFileId, BigDecimal finalPurityPct, BigDecimal finalWeightGrams,
            String resolutionNotes, Instant resolvedAt, Instant recordedAt) {

        static LabResultDto of(LabResult r) {
            return new LabResultDto(r.getId(), r.getLotId(), r.getLotCode(), r.getCollectorUserId(), r.getLabName(),
                    r.getMeasuredPurityPct(), r.getMeasuredWeightGrams(), r.getDeclaredPurityPct(),
                    r.getDeclaredWeightGrams(), r.getPurityDeltaPct(), r.getWeightDeltaPct(), r.getStatus(),
                    r.getReportFileId(), r.getFinalPurityPct(), r.getFinalWeightGrams(), r.getResolutionNotes(),
                    r.getResolvedAt(), r.getRecordedAt());
        }
    }

    record ResolveDiscrepancyRequest(
            @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal finalPurityPct,
            @NotNull @DecimalMin("0") BigDecimal finalWeightGrams,
            @NotBlank @Size(max = 2000) String notes) {
    }

    @GetMapping("/api/v1/lots/{lotId}/lab-result")
    LabResultDto get(CurrentUser me, @PathVariable UUID lotId) {
        return LabResultDto.of(lab.get(me, lotId));
    }

    @PostMapping(path = "/api/v1/lots/{lotId}/lab-result", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    LabResultDto record(CurrentUser me, @PathVariable UUID lotId,
            @RequestPart("file") MultipartFile file,
            @RequestParam("purityPct") BigDecimal purityPct,
            @RequestParam("weightGrams") BigDecimal weightGrams,
            @RequestParam("labName") String labName) {
        return LabResultDto.of(lab.record(me, lotId, file, purityPct, weightGrams, labName));
    }

    @GetMapping("/api/v1/admin/lab-results")
    List<LabResultDto> adminList(@RequestParam(required = false) LabResultStatus status) {
        return lab.list(status).stream().map(LabResultDto::of).toList();
    }

    @PostMapping("/api/v1/admin/lots/{lotId}/lab-result/resolve")
    LabResultDto resolve(CurrentUser me, @PathVariable UUID lotId, @Valid @RequestBody ResolveDiscrepancyRequest body) {
        return LabResultDto.of(lab.resolve(me, lotId, body.finalPurityPct(), body.finalWeightGrams(), body.notes()));
    }
}
