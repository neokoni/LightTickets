plugins {
    java
}

group = rootProject.findProperty("group") as String
version = rootProject.findProperty("version") as String

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
}

dependencies {
    compileOnly("io.papermc.paper:paper-api:1.21.1-R0.1-SNAPSHOT")
    compileOnly("org.apache.maven.resolver:maven-resolver-api:1.9.22")
    compileOnly("com.squareup.okhttp3:okhttp:4.12.0")
    compileOnly("io.socket:socket.io-client:2.1.0")
    compileOnly("org.xerial:sqlite-jdbc:3.45.3.0")
}

tasks.processResources {
    filesMatching("paper-plugin.yml") {
        expand("version" to version)
    }
}

tasks.jar {
    archiveFileName.set("LightTickets-${version}.jar")
}
