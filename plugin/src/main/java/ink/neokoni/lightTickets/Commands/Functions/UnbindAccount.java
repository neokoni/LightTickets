package ink.neokoni.lightTickets.Commands.Functions;

import ink.neokoni.lightTickets.Configs.Datas.PlayerBind;
import ink.neokoni.lightTickets.Configs.PlayerData;
import ink.neokoni.lightTickets.Utils.LangUtils;
import ink.neokoni.lightTickets.Utils.LogUtils;
import org.bukkit.entity.Player;

import java.util.Map;

public class UnbindAccount {
    public UnbindAccount(Player player) {
        try {
            run(player);
        } catch (Throwable t) {
            LogUtils.severe("logs.unbind_failed",
                    Map.of("{player}", player.getName(), "{message}", LogUtils.exceptionText(t)));
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", LogUtils.exceptionText(t))));
        }
    }

    private void run(Player player) {
        PlayerBind existing = PlayerData.getPlayerBind(player, true, false);
        if (existing == null || !existing.isBound()) {
            player.sendMessage(LangUtils.getLang("unbind.not_bound"));
            return;
        }

        player.sendMessage(LangUtils.getLang("unbind.web_required"));
    }

}
