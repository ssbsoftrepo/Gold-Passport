package com.pmd.goldpassport.onboarding.kyc;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.pmd.goldpassport.onboarding.internal.KycStatus;
import com.pmd.goldpassport.shared.Role;

import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.services.rekognition.RekognitionClient;
import software.amazon.awssdk.services.rekognition.model.CompareFacesMatch;
import software.amazon.awssdk.services.rekognition.model.CompareFacesRequest;
import software.amazon.awssdk.services.rekognition.model.CompareFacesResponse;
import software.amazon.awssdk.services.rekognition.model.DetectTextRequest;
import software.amazon.awssdk.services.rekognition.model.DetectTextResponse;
import software.amazon.awssdk.services.rekognition.model.Image;
import software.amazon.awssdk.services.rekognition.model.RekognitionException;
import software.amazon.awssdk.services.rekognition.model.TextDetection;

/**
 * Amazon Rekognition based checks:
 * <ol>
 *   <li>Face match between the identity photo (selfie) and the ID document (Miners).</li>
 *   <li>The declared document number appears in the text detected on the ID document.</li>
 * </ol>
 * Recommended upgrades: Rekognition Face Liveness in the mobile app and Textract AnalyzeID for
 * structured ID extraction; RENIEC/SUNAT lookups through a Peruvian provider.
 */
class RekognitionIdentityVerifier implements IdentityVerifier {

    private static final Logger log = LoggerFactory.getLogger(RekognitionIdentityVerifier.class);

    private final RekognitionClient rekognition;
    private final float similarityThreshold;

    RekognitionIdentityVerifier(RekognitionClient rekognition, float similarityThreshold) {
        this.rekognition = rekognition;
        this.similarityThreshold = similarityThreshold;
    }

    @Override
    public KycOutcome verify(KycRequest request) {
        if (request.role() == Role.COLLECTOR) {
            return new KycOutcome(KycStatus.NEEDS_REVIEW, "Company documents require manual review.");
        }
        List<String> notes = new ArrayList<>();
        boolean faceOk = request.role() != Role.MINER;
        boolean numberOk = false;
        boolean failed = false;

        KycRequest.Image id = request.idDocument();
        if (id == null || !id.isRasterImage()) {
            return new KycOutcome(KycStatus.NEEDS_REVIEW, "ID document is not a JPEG/PNG image; manual review required.");
        }

        if (request.role() == Role.MINER) {
            KycRequest.Image selfie = request.selfie();
            if (selfie != null && selfie.isRasterImage()) {
                try {
                    CompareFacesResponse res = rekognition.compareFaces(CompareFacesRequest.builder()
                            .sourceImage(image(selfie))
                            .targetImage(image(id))
                            .similarityThreshold(similarityThreshold)
                            .build());
                    float best = 0f;
                    for (CompareFacesMatch m : res.faceMatches()) {
                        best = Math.max(best, m.similarity());
                    }
                    faceOk = !res.faceMatches().isEmpty();
                    if (faceOk) {
                        notes.add(String.format(Locale.ROOT, "Face match %.1f%%.", best));
                    } else {
                        failed = !res.unmatchedFaces().isEmpty();
                        notes.add("Face on ID does not match the identity photo.");
                    }
                } catch (RekognitionException e) {
                    log.warn("Rekognition compareFaces failed: {}", e.getMessage());
                    notes.add("Face comparison not possible: " + e.getMessage());
                }
            } else {
                notes.add("Identity photo missing or not JPEG/PNG.");
            }
        }

        String declared = normalize(request.declaredDocumentNumber());
        try {
            DetectTextResponse text = rekognition.detectText(DetectTextRequest.builder().image(image(id)).build());
            StringBuilder all = new StringBuilder();
            for (TextDetection t : text.textDetections()) {
                all.append(normalize(t.detectedText()));
            }
            numberOk = !declared.isEmpty() && all.toString().contains(declared);
            notes.add(numberOk ? "Document number found on ID." : "Document number not found on ID image.");
        } catch (RekognitionException e) {
            log.warn("Rekognition detectText failed: {}", e.getMessage());
            notes.add("Text detection not possible: " + e.getMessage());
        }

        KycStatus status = failed ? KycStatus.FAILED : (faceOk && numberOk ? KycStatus.PASSED : KycStatus.NEEDS_REVIEW);
        return new KycOutcome(status, String.join(" ", notes));
    }

    private static Image image(KycRequest.Image img) {
        return Image.builder().bytes(SdkBytes.fromByteArray(img.bytes())).build();
    }

    private static String normalize(String s) {
        return s == null ? "" : s.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
    }
}
