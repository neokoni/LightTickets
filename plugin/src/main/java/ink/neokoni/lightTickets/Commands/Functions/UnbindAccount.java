package ink.neokoni.lightTickets.Commands.Functions;

import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Datas.PlayerBind;
import ink.neokoni.lightTickets.Configs.PlayerData;
import ink.neokoni.lightTickets.Utils.ApiClient;
import ink.neokoni.lightTickets.Utils.ApiEndpoint;
import ink.neokoni.lightTickets.Utils.HttpUtils;
import ink.neokoni.lightTickets.Utils.JsonUtils;
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

        JsonObject body = new JsonObject();
        body.addProperty("minecraftUuid", player.getUniqueId().toString());

        HttpUtils.Resp resp;
        try {
            resp = ApiClient.requestWithStatus(ApiEndpoint.MC_UNLINK, JsonUtils.toJson(body));
        } catch (RuntimeException e) {
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", e.getMessage() == null ? LangUtils.getRawLang("errors.unknown") : e.getMessage())));
            return;
        }
        if (resp == null || resp.body() == null || resp.body().isEmpty()) {
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", LangUtils.getRawLang("errors.empty_response"))));
            return;
        }

        JsonObject parsed = JsonUtils.fromJson(resp.body(), JsonObject.class);
        if (parsed != null && parsed.has("id")) {
            markUnbound(player);
            player.sendMessage(LangUtils.getLang("unbind.success"));
            return;
        }

        if (resp.status() == 404) {
            markUnbound(player);
            player.sendMessage(LangUtils.getLang("unbind.not_bound"));
            return;
        }
        player.sendMessage(LangUtils.getLang("errors.api_failed",
                Map.of("{message}", ApiClient.errorMessage(parsed))));
    }

    private void markUnbound(Player player) {
        PlayerBind bind = PlayerData.getPlayerBind(player, true, true);
        bind.setBound(false);
        bind.setBindCode(null);
        bind.setCodeExpiresAt(null);
        bind.setRole("player");
        PlayerData.setPlayerBind(player, bind);
    }

}
