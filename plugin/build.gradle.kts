plugins {
    id("java-library")
    id("xyz.jpenilla.run-paper") version "3.0.2"
    id("com.gradleup.shadow") version "8.3.10"
    id("io.freefair.lombok") version "8.7.1"
}

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
}

dependencies {
    compileOnly("io.papermc.paper:paper-api:1.21-R0.1-SNAPSHOT")
    compileOnly("com.google.code.gson:gson:2.13.2")
    compileOnly("com.zaxxer:HikariCP:7.0.2")
    compileOnly("com.mysql:mysql-connector-j:9.5.0");
    compileOnly("org.mariadb.jdbc:mariadb-java-client:3.5.6");
    compileOnly("org.xerial:sqlite-jdbc:3.51.2.0")

    implementation("de.exlll:configlib-yaml:4.8.1")
}

java {
    toolchain.languageVersion = JavaLanguageVersion.of(21)
}

tasks {
    runServer {
        // Configure the Minecraft version for our task.
        // This is the only required configuration besides applying the plugin.
        // Your plugin's jar (or shadowJar if present) will be used automatically.
        minecraftVersion("1.21")
        jvmArgs("-Xms2G", "-Xmx2G")
    }

    processResources {
        val props = mapOf(
            "version" to version,
            "description" to project.description,
            "prefix" to project.name
        )
        filesMatching("paper-plugin.yml") {
            expand(props)
        }
    }

    shadowJar {
        relocate("de.exlll", "ink.neokoni.lightTickets.libs.configlib")
        minimize()
    }

    build {
        dependsOn(shadowJar)
    }
}
