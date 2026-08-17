plugins {
    id("com.gradleup.shadow")
}

repositories {
    maven("https://repo.papermc.io/repository/maven-snapshots/")
}

dependencies {
    implementation(project(":common"))
    compileOnly("com.velocitypowered:velocity-api:3.6.0-SNAPSHOT")
    compileOnly("org.jetbrains:annotations:24.1.0")

    implementation("com.google.code.gson:gson:2.13.2")
    implementation("com.zaxxer:HikariCP:7.0.2")
    implementation("com.mysql:mysql-connector-j:9.5.0")
    implementation("org.mariadb.jdbc:mariadb-java-client:3.5.6")
    implementation("org.xerial:sqlite-jdbc:3.51.2.0")
    implementation("io.socket:socket.io-client:2.1.0")
    implementation("com.github.retrooper:packetevents-velocity:2.13.0")
    implementation("net.kyori:adventure-api:4.17.0")
}

tasks {
    processResources {
        val props = mapOf(
            "version" to project.version,
            "description" to project.description
        )
        filesMatching("velocity-plugin.json") {
            expand(props)
        }
    }

    shadowJar {
        archiveBaseName.set("LightTickets-" + project.name)
        archiveClassifier.set("all")

        relocate("com.github.retrooper", "ink.neokoni.lightTickets.libs.packetevents")
        relocate("io.github.retrooper", "ink.neokoni.lightTickets.libs.packetevents")
        relocate("com.google.gson", "ink.neokoni.lightTickets.libs.gson")
        relocate("de.excll", "ink.neokoni.lightTickets.libs.configlib")
        relocate("org.yaml", "ink.neokoni.lightTickets.libs.snakeyaml")
        relocate("com.zaxxer", "ink.neokoni.lightTickets.libs.hikari")
        relocate("com.mysql", "ink.neokoni.lightTickets.libs.mysql")
        relocate("org.mariadb", "ink.neokoni.lightTickets.libs.mariadb")
        relocate("io.socket", "ink.neokoni.lightTickets.libs.socketio")
        relocate("org.json", "ink.neokoni.lightTickets.libs.json")
        relocate("okhttp3", "ink.neokoni.lightTickets.libs.okhttp")
        relocate("okio", "ink.neokoni.lightTickets.libs.okio")

        exclude("com/velocitypowered/**")
        exclude("META-INF/velocity-plugin.json")
    }

    build {
        dependsOn(shadowJar)
    }
}
