package ink.neokoni.lightTickets.velocity;

import com.github.retrooper.packetevents.PacketEvents;
import com.github.retrooper.packetevents.event.PacketListenerPriority;
import com.github.retrooper.packetevents.settings.PacketEventsSettings;
import com.google.inject.Inject;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent;
import com.velocitypowered.api.event.proxy.ProxyShutdownEvent;
import com.velocitypowered.api.plugin.PluginContainer;
import com.velocitypowered.api.plugin.annotation.DataDirectory;
import com.velocitypowered.api.proxy.ProxyServer;
import ink.neokoni.lightTickets.LightTicketsCore;
import ink.neokoni.lightTickets.velocity.Commands.VelocityCommandRegister;
import ink.neokoni.lightTickets.velocity.Listeners.ConnectListener;
import ink.neokoni.lightTickets.velocity.Listeners.PermissionsCompatListener;
import ink.neokoni.lightTickets.velocity.packet.ChatInputListener;
import ink.neokoni.lightTickets.velocity.packet.PlayerContextListener;
import ink.neokoni.lightTickets.velocity.platform.VelocityPlatform;
import io.github.retrooper.packetevents.velocity.factory.VelocityPacketEventsBuilder;
import org.slf4j.Logger;

import java.nio.file.Path;

public final class LightTicketsVelocity {

    private final ProxyServer server;
    private final Logger logger;
    private final Path dataDirectory;
    private final PluginContainer container;

    @Inject
    public LightTicketsVelocity(ProxyServer server, Logger logger,
                                @DataDirectory Path dataDirectory, PluginContainer container) {
        this.server = server;
        this.logger = logger;
        this.dataDirectory = dataDirectory;
        this.container = container;
    }

    @Subscribe
    public void onProxyInitialize(ProxyInitializeEvent event) {
        PacketEvents.setAPI(VelocityPacketEventsBuilder.build(
                server, container, logger, dataDirectory,
                new PacketEventsSettings().checkForUpdates(false)));
        PacketEvents.getAPI().load();
        PacketEvents.getAPI().getEventManager().registerListener(
                new PlayerContextListener(), PacketListenerPriority.NORMAL);
        PacketEvents.getAPI().getEventManager().registerListener(
                new ChatInputListener(), PacketListenerPriority.NORMAL);
        PacketEvents.getAPI().init();

        LightTicketsCore.enable(new VelocityPlatform(this));
        server.getEventManager().register(this, new ConnectListener(this));
        server.getEventManager().register(this, new PermissionsCompatListener());
        new VelocityCommandRegister(this);
    }

    @Subscribe
    public void onProxyShutdown(ProxyShutdownEvent event) {
        LightTicketsCore.disable();
        PacketEvents.getAPI().terminate();
    }

    public ProxyServer getServer() {
        return server;
    }

    public Logger getLogger() {
        return logger;
    }

    public Path getDataDirectory() {
        return dataDirectory;
    }
}
