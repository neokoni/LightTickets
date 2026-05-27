package ink.neokoni.lighttickets;

import io.papermc.paper.plugin.loader.PluginClasspathBuilder;
import io.papermc.paper.plugin.loader.PluginLoader;
import io.papermc.paper.plugin.loader.library.impl.MavenLibraryResolver;
import org.eclipse.aether.artifact.DefaultArtifact;
import org.eclipse.aether.graph.Dependency;

public class LightTicketsLoader implements PluginLoader {

    @Override
    public void classloader(PluginClasspathBuilder classpathBuilder) {
        MavenLibraryResolver resolver = new MavenLibraryResolver();

        resolver.addDependency(new Dependency(
            new DefaultArtifact("com.squareup.okhttp3:okhttp:4.12.0"), null));
        resolver.addDependency(new Dependency(
            new DefaultArtifact("io.socket:socket.io-client:2.1.0"), null));
        resolver.addDependency(new Dependency(
            new DefaultArtifact("org.xerial:sqlite-jdbc:3.45.3.0"), null));

        classpathBuilder.addLibrary(resolver);
    }
}
