package ink.neokoni.lightTickets.Commands.Functions;

import ink.neokoni.lightTickets.Utils.ConfigUtils;
import ink.neokoni.lightTickets.Utils.LangUtils;
import ink.neokoni.lightTickets.Utils.WebSocketClient;
import ink.neokoni.lightTickets.platform.LightSender;

public class Reload {
    public Reload(LightSender sender) {
        ConfigUtils.reloadAllConfigs();
        WebSocketClient.start();
        sender.sendMessage(LangUtils.getLang("system.reload_success"));
    }
}
