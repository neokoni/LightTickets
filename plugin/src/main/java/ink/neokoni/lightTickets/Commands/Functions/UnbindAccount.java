package ink.neokoni.lightTickets.Commands.Functions;

import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.Configs.Datas.PlayerBind;
import ink.neokoni.lightTickets.Configs.PlayerData;
import ink.neokoni.lightTickets.LightTickets;
import ink.neokoni.lightTickets.Utils.HttpUtils;
import ink.neokoni.lightTickets.Utils.JsonUtils;
import ink.neokoni.lightTickets.Utils.LangUtils;
import org.bukkit.entity.Player;

import java.util.Map;

public class UnbindAccount {
    public UnbindAccount(Player player) {
        try {
            run(player);
        } catch (Throwable t) {
            LightTickets.getInstance().getLogger().log(java.util.logging.Level.SEVERE,
                    "Error while unbinding account for " + player.getName(), t);
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", t.getClass().getSimpleName() + ": "
                            + (t.getMessage() == null ? "no message" : t.getMessage()))));
        }
    }

    private void run(Player player) {
        PlayerBind existing = PlayerData.getPlayerBind(player, true, false);
        if (existing == null || !existing.isBound()) {
            player.sendMessage(LangUtils.getLang("unbind.not_bound"));
            return;
        }

        String baseUrl = trimTrailingSlash(Config.getConfig().getBaseUrl());
        JsonObject body = new JsonObject();
        body.addProperty("minecraftUuid", player.getUniqueId().toString());
        Map<String, String> headers = Map.of(
                "Content-Type", "application/json",
                "X-Server-Key", Config.getConfig().getServerKey());

        String resp;
        try {
            resp = HttpUtils.post(baseUrl + "/api/mc/unlink",
                    JsonUtils.toJson(body), headers);
        } catch (RuntimeException e) {
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", e.getMessage() == null ? "unknown" : e.getMessage())));
            return;
        }
        if (resp == null || resp.isEmpty()) {
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", "empty response")));
            return;
        }

        JsonObject parsed = JsonUtils.fromJson(resp, JsonObject.class);
        if (parsed != null && parsed.has("id")) {
            markUnbound(player);
            player.sendMessage(LangUtils.getLang("unbind.success"));
            return;
        }

        String msg = parsed != null && parsed.has("error") ? parsed.get("error").getAsString() : "invalid response";
        if (msg.contains("not linked")) {
            markUnbound(player);
            player.sendMessage(LangUtils.getLang("unbind.not_bound"));
            return;
        }
        player.sendMessage(LangUtils.getLang("errors.api_failed",
                Map.of("{message}", msg)));
    }

    private void markUnbound(Player player) {
        PlayerBind bind = PlayerData.getPlayerBind(player, true, true);
        bind.setBound(false);
        bind.setBindCode(null);
        bind.setCodeExpiresAt(null);
        PlayerData.setPlayerBind(player, bind);
    }

    private String trimTrailingSlash(String url) {
        if (url == null) return "";
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
