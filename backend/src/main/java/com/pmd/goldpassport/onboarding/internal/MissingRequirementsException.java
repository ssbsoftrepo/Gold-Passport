package com.pmd.goldpassport.onboarding.internal;

import java.util.List;

import com.pmd.goldpassport.shared.BusinessRuleException;

public class MissingRequirementsException extends BusinessRuleException {

    public MissingRequirementsException(List<String> missing) {
        super("ONBOARDING_INCOMPLETE", "Missing or invalid: " + String.join(", ", missing));
    }
}
