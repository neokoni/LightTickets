package ink.neokoni.lightTickets.platform;

import java.util.UUID;

public interface LightPlayer extends LightSender {

    UUID getUniqueId();

    String getName();

    String getWorldName();

    int getBlockX();

    int getBlockY();

    int getBlockZ();

    String getGameMode();
}
