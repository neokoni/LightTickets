package ink.neokoni.lightTickets;

import ink.neokoni.lightTickets.Commands.CommandRegister;
import ink.neokoni.lightTickets.Utils.ConfigUtils;
import lombok.Getter;
import org.bukkit.plugin.java.JavaPlugin;

public final class LightTickets extends JavaPlugin {

    @Getter private static LightTickets instance;

    @Override
    public void onEnable() {
        instance = this;

        ConfigUtils.loadAllConfigs();

        new CommandRegister();
    }

    @Override
    public void onDisable() {
    }
}