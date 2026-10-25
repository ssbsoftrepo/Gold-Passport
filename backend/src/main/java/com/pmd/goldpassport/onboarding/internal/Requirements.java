package com.pmd.goldpassport.onboarding.internal;

import java.util.ArrayList;
import java.util.List;

import com.pmd.goldpassport.shared.IdDocumentType;
import com.pmd.goldpassport.shared.Validators;

/**
 * What each role must provide before submitting (mirrors the onboarding flow diagrams):
 * <ul>
 *   <li>Miner: personal data, phone (from login), email, identification document, identity photo.</li>
 *   <li>Transporter: personal data, identification document, driver's license.</li>
 *   <li>Collector/Plant: company name, RUC, address, legal representative, legal documents.</li>
 * </ul>
 * Keys are machine readable ({@code field.x}, {@code invalid.x}, {@code document.KIND}) so apps can
 * translate them.
 */
public final class Requirements {

    private Requirements() {
    }

    public static List<String> missing(OnboardingApplication a) {
        List<String> missing = new ArrayList<>();
        switch (a.getRole()) {
            case MINER -> {
                person(a, missing);
                field(missing, "email", a.getEmail());
                document(a, missing, DocumentKind.ID_DOCUMENT);
                document(a, missing, DocumentKind.SELFIE);
            }
            case TRANSPORTER -> {
                person(a, missing);
                field(missing, "driverLicenseNumber", a.getDriverLicenseNumber());
                document(a, missing, DocumentKind.ID_DOCUMENT);
                document(a, missing, DocumentKind.DRIVER_LICENSE);
            }
            case COLLECTOR -> {
                field(missing, "companyName", a.getCompanyName());
                field(missing, "ruc", a.getRuc());
                if (a.getRuc() != null && !Validators.isValidRuc(a.getRuc())) {
                    missing.add("invalid.ruc");
                }
                field(missing, "companyAddress", a.getCompanyAddress());
                field(missing, "legalRepresentative", a.getLegalRepresentative());
                document(a, missing, DocumentKind.COMPANY_LEGAL_DOCUMENT);
            }
            default -> missing.add("invalid.role");
        }
        return missing;
    }

    private static void person(OnboardingApplication a, List<String> missing) {
        field(missing, "fullName", a.getFullName());
        if (a.getDocumentType() == null) {
            missing.add("field.documentType");
        } else if (a.getDocumentType() == IdDocumentType.RUC) {
            missing.add("invalid.documentType");
        }
        field(missing, "documentNumber", a.getDocumentNumber());
        if (a.getDocumentType() != null && a.getDocumentNumber() != null
                && !Validators.isValidDocument(a.getDocumentType(), a.getDocumentNumber())) {
            missing.add("invalid.documentNumber");
        }
    }

    private static void field(List<String> missing, String name, String value) {
        if (Validators.isBlank(value)) {
            missing.add("field." + name);
        }
    }

    private static void document(OnboardingApplication a, List<String> missing, DocumentKind kind) {
        if (a.latest(kind).isEmpty()) {
            missing.add("document." + kind.name());
        }
    }
}
