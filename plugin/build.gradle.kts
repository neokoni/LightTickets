plugins {
    java
    id("io.freefair.lombok") version "8.7.1" apply false
    id("com.gradleup.shadow") version "8.3.10" apply false
    id("xyz.jpenilla.run-paper") version "3.0.2" apply false
}

allprojects {
    group = "ink.neokoni.LightTickets"
    version = "1.0.0"
    description = "A LightWeight issue platform support for Minecraft Server"
}

subprojects {
    apply(plugin = "java")
    apply(plugin = "io.freefair.lombok")

    repositories {
        mavenCentral()
        maven("https://repo.papermc.io/repository/maven-public/")
        maven("https://repo.codemc.io/repository/maven-releases/")
    }

    java {
        toolchain.languageVersion = JavaLanguageVersion.of(21)
    }
}
