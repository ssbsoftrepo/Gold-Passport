# Build from the repository root (the API contract lives in ../api):
#   docker build -f backend/Dockerfile -t pmd/gold-passport-backend .
# Images are multi-arch, so this also builds for AWS Graviton (arm64).

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY api/openapi.yaml api/openapi.yaml
COPY backend/pom.xml backend/pom.xml
RUN mvn -f backend/pom.xml -B -q dependency:go-offline
COPY backend/src backend/src
RUN mvn -f backend/pom.xml -B -q -DskipTests package

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build /src/backend/target/gold-passport-backend-*.jar /app/app.jar
RUN mkdir -p /app/data && chown -R app:app /app
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:8080/actuator/health/liveness || exit 1
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
