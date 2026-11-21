# ---- sborka ----
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY haki-project2/haki/backend/pom.xml .
RUN mvn -q -B dependency:go-offline
COPY haki-project2/haki/backend/src ./src
RUN mvn -q -B -DskipTests package

# ---- zapusk ----
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/target/haki-pos-backend-0.1.0.jar app.jar
ENV TZ=Asia/Tashkent
EXPOSE 8080
# SerialGC + C1: men'she pamyati i bystree start (vazhno na besplatnom tarife, gde server zasypaet)
ENTRYPOINT ["java", "-Duser.timezone=Asia/Tashkent", "-XX:MaxRAMPercentage=70", "-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1", "-Xss512k", "-Dspring.jmx.enabled=false", "-jar", "app.jar"]
