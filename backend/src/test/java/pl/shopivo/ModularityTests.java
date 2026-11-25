package pl.shopivo;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.modulith.docs.Documenter;

/** Fails the build when a module accesses another module's internals or module dependencies form a cycle. */
class ModularityTests {

    private final ApplicationModules modules = ApplicationModules.of(ShopivoApplication.class);

    @Test
    void verifiesModuleBoundaries() {
        modules.verify();
    }

    @Test
    void writesModuleDocumentation() {
        new Documenter(modules, Documenter.Options.defaults().withOutputFolder("target/modulith-docs"))
                .writeModulesAsPlantUml()
                .writeIndividualModulesAsPlantUml();
    }
}
