plugins {
    id("com.gradleup.shadow")
    id("xyz.jpenilla.run-paper")
}

dependencies {
    implementation(project(":common"))
    compileOnly("io.papermc.paper:paper-api:1.21-R0.1-SNAPSHOT")
    compileOnly("org.jetbrains:annotations:24.1.0")
}

tasks {
    runServer {
        // Reuse the existing test server directory (plugin/run).
        runDirectory.set(file("../run"))
        minecraftVersion("1.21")
        jvmArgs("-Xms2G", "-Xmx2G")
    }

    processResources {
        val props = mapOf(
            "version" to project.version,
            "description" to project.description,
            "prefix" to rootProject.name
        )
        filesMatching("paper-plugin.yml") {
            expand(props)
        }
    }

    shadowJar {
        archiveBaseName.set("LightTickets-" + project.name)
        archiveClassifier.set("all")
        relocate("de.excll", "ink.neokoni.lightTickets.libs.configlib")
        relocate("org.yaml", "ink.neokoni.lightTickets.libs.snakeyaml")
        minimize {
            exclude(project(":common"))
        }
    }

    build {
        dependsOn(shadowJar)
    }
}
