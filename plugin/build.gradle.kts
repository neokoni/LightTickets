plugins {
    java
    id("io.freefair.lombok") version "8.7.1" apply false
    id("com.gradleup.shadow") version "8.3.10" apply false
    id("xyz.jpenilla.run-paper") version "3.0.2" apply false
}

allprojects {
    group = property("group") as String
    version = project.property("version") as String
    description = project.property("description") as String
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
