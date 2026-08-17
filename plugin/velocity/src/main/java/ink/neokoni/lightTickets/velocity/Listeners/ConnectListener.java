package ink.neokoni.lightTickets.velocity.Listeners;

import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.connection.DisconnectEvent;
import com.velocitypowered.api.event.player.ServerPostConnectEvent;
import com.velocitypowered.api.proxy.Player;
import ink.neokoni.lightTickets.Commands.Functions.AddComment;
import ink.neokoni.lightTickets.Commands.Functions.CreateTicket;
import ink.neokoni.lightTickets.Commands.Functions.TicketInfo;
import ink.neokoni.lightTickets.Configs.PlayerData;
import ink.neokoni.lightTickets.Utils.DataRefreshManager;
import ink.neokoni.lightTickets.velocity.LightTicketsVelocity;
import ink.neokoni.lightTickets.velocity.packet.PlayerContextListener;
import ink.neokoni.lightTickets.velocity.platform.VelocityPlayer;

import java.util.UUID;

public final class ConnectListener {

    @SuppressWarnings("unused")
    private final LightTicketsVelocity plugin;

    public ConnectListener(LightTicketsVelocity plugin) {
        this.plugin = plugin;
    }

    @Subscribe
    public void onPostConnect(ServerPostConnectEvent event) {
        Player player = event.getPlayer();
        if (player != null) {
            DataRefreshManager.onPlayerJoin(player.getUniqueId());
        }
    }

    @Subscribe
    public void onDisconnect(DisconnectEvent event) {
        Player player = event.getPlayer();
        UUID uuid = player.getUniqueId();
        DataRefreshManager.onPlayerQuit(uuid);
        PlayerData.removePlayerData(uuid);
        TicketInfo.removePlayerComments(uuid);
        PlayerContextListener.remove(uuid);
        CreateTicket.removeSession(new VelocityPlayer(player));
        AddComment.removeSession(new VelocityPlayer(player));
    }
}
