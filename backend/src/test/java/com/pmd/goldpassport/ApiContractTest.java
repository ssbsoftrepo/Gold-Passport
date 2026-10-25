package com.pmd.goldpassport;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import java.lang.reflect.Method;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;
import org.yaml.snakeyaml.Yaml;

/**
 * Fails when the controllers and api/openapi.yaml (the contract the apps are generated from)
 * disagree on any endpoint. Path parameter names are ignored; methods and paths must match.
 */
class ApiContractTest {

    private static final Set<String> HTTP_METHODS = Set.of("get", "post", "put", "patch", "delete");

    @Test
    void everyContractOperationIsImplementedAndViceVersa() throws Exception {
        Set<String> contract = contractOperations();
        Set<String> implemented = implementedOperations();

        Set<String> missing = new TreeSet<>(contract);
        missing.removeAll(implemented);
        Set<String> undocumented = new TreeSet<>(implemented);
        undocumented.removeAll(contract);

        assertThat(missing).as("In openapi.yaml but not implemented").isEmpty();
        assertThat(undocumented).as("Implemented but missing from openapi.yaml").isEmpty();
    }

    @SuppressWarnings("unchecked")
    private Set<String> contractOperations() throws Exception {
        Set<String> ops = new TreeSet<>();
        try (InputStream in = getClass().getResourceAsStream("/static/openapi.yaml")) {
            assertThat(in).as("openapi.yaml on the classpath (copied from ../api by the build)").isNotNull();
            Map<String, Object> root = new Yaml().load(in);
            Map<String, Map<String, Object>> paths = (Map<String, Map<String, Object>>) root.get("paths");
            paths.forEach((path, item) -> item.keySet().stream()
                    .filter(HTTP_METHODS::contains)
                    .forEach(m -> ops.add(m.toUpperCase() + " " + normalize(path))));
        }
        return ops;
    }

    private Set<String> implementedOperations() throws Exception {
        Set<String> ops = new TreeSet<>();
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));
        for (BeanDefinition bd : scanner.findCandidateComponents("com.pmd.goldpassport")) {
            Class<?> type = Class.forName(bd.getBeanClassName());
            RequestMapping classMapping = AnnotatedElementUtils.findMergedAnnotation(type, RequestMapping.class);
            String prefix = classMapping != null && classMapping.path().length > 0 ? classMapping.path()[0] : "";
            for (Method method : type.getDeclaredMethods()) {
                RequestMapping mapping = AnnotatedElementUtils.findMergedAnnotation(method, RequestMapping.class);
                if (mapping == null) {
                    continue;
                }
                String[] paths = mapping.path().length == 0 ? new String[] {""} : mapping.path();
                for (String p : paths) {
                    for (RequestMethod rm : mapping.method()) {
                        String full = prefix + p;
                        if (full.startsWith("/api/")) {
                            ops.add(rm.name() + " " + normalize(full));
                        }
                    }
                }
            }
        }
        return ops;
    }

    private static String normalize(String path) {
        return path.replaceAll("\\{[^}]+}", "{}");
    }
}
