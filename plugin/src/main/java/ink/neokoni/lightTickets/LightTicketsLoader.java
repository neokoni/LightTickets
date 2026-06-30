package ink.neokoni.lightTickets;

import io.papermc.paper.plugin.loader.PluginClasspathBuilder;
import io.papermc.paper.plugin.loader.PluginLoader;
import io.papermc.paper.plugin.loader.library.impl.MavenLibraryResolver;
import org.eclipse.aether.artifact.DefaultArtifact;
import org.eclipse.aether.graph.Dependency;
import org.eclipse.aether.repository.RemoteRepository;
import org.jetbrains.annotations.NotNull;

public class LightTicketsLoader implements PluginLoader {

    private static MavenLibraryResolver PAPER_PUBLIC;

    @Override
    public void classloader(@NotNull PluginClasspathBuilder classpathBuilder) {
        PAPER_PUBLIC = new MavenLibraryResolver();
        PAPER_PUBLIC.addRepository(new RemoteRepository.Builder(
                "paper", "default",
                "https://repo.papermc.io/repository/maven-public/").build());

        addPaperRepoDependency("com.google.code.gson:gson:2.13.2");
        addPaperRepoDependency("com.zaxxer:HikariCP:7.0.2");
        addPaperRepoDependency("com.mysql:mysql-connector-j:9.5.0");
        addPaperRepoDependency("org.mariadb.jdbc:mariadb-java-client:3.5.6");
        addPaperRepoDependency("org.xerial:sqlite-jdbc:3.51.2.0");
        classpathBuilder.addLibrary(PAPER_PUBLIC);
    }

    private void addPaperRepoDependency(String lib) {
        PAPER_PUBLIC.addDependency(new Dependency(new DefaultArtifact(lib), null));
    }
}