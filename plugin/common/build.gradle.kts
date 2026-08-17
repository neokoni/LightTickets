plugins {
    `java-library`
}

dependencies {
    // Provided by both platforms at runtime (Paper server / Velocity proxy).
    compileOnly("net.kyori:adventure-api:4.17.0")
    compileOnly("net.kyori:adventure-text-minimessage:4.17.0")
    compileOnly("com.google.code.gson:gson:2.13.2")
    compileOnly("com.zaxxer:HikariCP:7.0.2")
    compileOnly("com.mysql:mysql-connector-j:9.5.0")
    compileOnly("org.mariadb.jdbc:mariadb-java-client:3.5.6")
    compileOnly("org.xerial:sqlite-jdbc:3.51.2.0")
    compileOnly("io.socket:socket.io-client:2.1.0")
    compileOnly("org.jetbrains:annotations:24.1.0")

    // Shaded into each platform jar.
    api("de.exlll:configlib-yaml:4.8.1")
    api("org.yaml:snakeyaml:2.2")
}
