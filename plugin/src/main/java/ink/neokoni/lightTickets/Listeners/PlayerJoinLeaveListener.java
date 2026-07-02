package ink.neokoni.lightTickets.Listeners;

import ink.neokoni.lightTickets.Configs.PlayerData;
import ink.neokoni.lightTickets.Utils.DataRefreshManager;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;

public class PlayerJoinLeaveListener implements Listener {

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onJoin(PlayerJoinEvent event) {
        DataRefreshManager.onPlayerJoin(event.getPlayer().getUniqueId());
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        var uuid = event.getPlayer().getUniqueId();
        DataRefreshManager.onPlayerQuit(uuid);
        PlayerData.removePlayerData(uuid);
    }
}
