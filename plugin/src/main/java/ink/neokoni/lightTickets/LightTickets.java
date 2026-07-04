package ink.neokoni.lightTickets;

import ink.neokoni.lightTickets.Commands.CommandRegister;
import ink.neokoni.lightTickets.Configs.Templates;
import ink.neokoni.lightTickets.Listeners.PlayerJoinLeaveListener;
import ink.neokoni.lightTickets.Listeners.TicketChatListener;
import ink.neokoni.lightTickets.Utils.ConfigUtils;
import ink.neokoni.lightTickets.Utils.DataRefreshManager;
import ink.neokoni.lightTickets.Utils.WebSocketClient;
import lombok.Getter;
import org.bukkit.Bukkit;
import org.bukkit.plugin.java.JavaPlugin;

public final class LightTickets extends JavaPlugin {

    @Getter private static LightTickets instance;

    @Override
    public void onEnable() {
        instance = this;

        ConfigUtils.loadAllConfigs();

        Bukkit.getPluginManager().registerEvents(new TicketChatListener(), this);
        Bukkit.getPluginManager().registerEvents(new PlayerJoinLeaveListener(), this);

        new CommandRegister();

        Templates.startRefreshTask();
        DataRefreshManager.start();
        WebSocketClient.start();
    }

    @Override
    public void onDisable() {
        WebSocketClient.shutdown();
        DataRefreshManager.shutdown();
    }
}
