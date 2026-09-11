package ink.neokoni.lightTickets.platform;

import org.jetbrains.annotations.Nullable;

import java.util.UUID;

public interface LightPlayer extends LightSender {

    UUID getUniqueId();

    /**
     * Backend server id taken from the platform's own server registry, reported to LightTickets as
     * the request source. Returns {@code null} when the plugin only ever runs on one server
     * (Paper/Folia).
     */
    @Nullable
    String getServerId();

    String getName();

    String getWorldName();

    int getBlockX();

    int getBlockY();

    int getBlockZ();

    String getGameMode();
}
