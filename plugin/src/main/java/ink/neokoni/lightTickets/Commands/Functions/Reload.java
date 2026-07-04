package ink.neokoni.lightTickets.Commands.Functions;

import ink.neokoni.lightTickets.Utils.ConfigUtils;
import ink.neokoni.lightTickets.Utils.LangUtils;
import ink.neokoni.lightTickets.Utils.WebSocketClient;
import org.bukkit.command.CommandSender;

public class Reload {
    public Reload(CommandSender sender) {
        ConfigUtils.reloadAllConfigs();
        WebSocketClient.start();
        sender.sendMessage(LangUtils.getLang("system.reload_success"));
    }
}
