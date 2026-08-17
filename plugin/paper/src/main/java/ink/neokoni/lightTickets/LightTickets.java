package ink.neokoni.lightTickets;

import ink.neokoni.lightTickets.Commands.CommandRegister;
import ink.neokoni.lightTickets.LightTicketsCore;
import ink.neokoni.lightTickets.Listeners.PlayerJoinLeaveListener;
import ink.neokoni.lightTickets.Listeners.TicketChatListener;
import ink.neokoni.lightTickets.platform.PaperPlatform;
import lombok.Getter;
import org.bukkit.Bukkit;
import org.bukkit.plugin.java.JavaPlugin;

public final class LightTickets extends JavaPlugin {

    @Getter private static LightTickets instance;

    @Override
    public void onEnable() {
        instance = this;

        LightTicketsCore.enable(new PaperPlatform(this));

        Bukkit.getPluginManager().registerEvents(new TicketChatListener(), this);
        Bukkit.getPluginManager().registerEvents(new PlayerJoinLeaveListener(), this);

        new CommandRegister();
    }

    @Override
    public void onDisable() {
        LightTicketsCore.disable();
    }
}
