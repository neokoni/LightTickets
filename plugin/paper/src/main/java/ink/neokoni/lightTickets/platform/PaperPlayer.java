package ink.neokoni.lightTickets.platform;

import net.kyori.adventure.text.Component;
import org.bukkit.entity.Player;

import java.util.UUID;

public final class PaperPlayer implements LightPlayer {

    private final Player player;

    public PaperPlayer(Player player) {
        this.player = player;
    }

    @Override
    public UUID getUniqueId() {
        return player.getUniqueId();
    }

    @Override
    public String getName() {
        return player.getName();
    }

    @Override
    public String getWorldName() {
        return player.getWorld().getName();
    }

    @Override
    public int getBlockX() {
        return player.getLocation().getBlockX();
    }

    @Override
    public int getBlockY() {
        return player.getLocation().getBlockY();
    }

    @Override
    public int getBlockZ() {
        return player.getLocation().getBlockZ();
    }

    @Override
    public String getGameMode() {
        return player.getGameMode().name().toLowerCase();
    }

    @Override
    public void sendMessage(Component message) {
        player.sendMessage(message);
    }
}
