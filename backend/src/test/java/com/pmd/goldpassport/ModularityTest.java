package com.pmd.goldpassport;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.modulith.docs.Documenter;

/**
 * Guards the modular monolith:
 * <ul>
 *   <li>no module touches another module's internals (anything outside its base package),</li>
 *   <li>no dependency cycles between modules.</li>
 * </ul>
 * Also writes C4/PlantUML module diagrams and a module canvas to {@code target/spring-modulith-docs}.
 */
class ModularityTest {

    private final ApplicationModules modules = ApplicationModules.of(GoldPassportApplication.class);

    @Test
    void modulesRespectTheirBoundaries() {
        modules.verify();
    }

    @Test
    void writeModuleDocumentation() {
        new Documenter(modules)
                .writeModulesAsPlantUml()
                .writeIndividualModulesAsPlantUml()
                .writeModuleCanvases();
    }
}
