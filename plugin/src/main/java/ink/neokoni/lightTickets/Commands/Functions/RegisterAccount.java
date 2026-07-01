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

public class RegisterAccount {
    public RegisterAccount(Player player, String username, String email, String password) {
        try {
            run(player, username, email, password);
        } catch (Throwable t) {
            LightTickets.getInstance().getLogger().log(java.util.logging.Level.SEVERE,
                    "Error while registering account for " + player.getName(), t);
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", t.getClass().getSimpleName() + ": "
                            + (t.getMessage() == null ? "no message" : t.getMessage()))));
        }
    }

    private void run(Player player, String username, String email, String password) {
        PlayerBind existing = PlayerData.getPlayerBind(player, true, false);
        if (existing != null && existing.isBound()) {
            player.sendMessage(LangUtils.getLang("bind.already_bound"));
            return;
        }

        if (email == null || email.isEmpty() || !email.contains("@")) {
            player.sendMessage(LangUtils.getLang("register.invalid_email"));
            return;
        }
        if (password == null || password.length() < 8) {
            player.sendMessage(LangUtils.getLang("register.password_too_short"));
            return;
        }
        if (username == null || username.length() < 2 || username.length() > 32) {
            player.sendMessage(LangUtils.getLang("register.invalid_username"));
            return;
        }

        String baseUrl = trimTrailingSlash(Config.getConfig().getBaseUrl());
        JsonObject body = new JsonObject();
        body.addProperty("email", email);
        body.addProperty("password", password);
        body.addProperty("username", username);
        body.addProperty("minecraftUuid", player.getUniqueId().toString());
        body.addProperty("minecraftName", player.getName());

        Map<String, String> headers = Map.of(
                "Content-Type", "application/json",
                "X-Server-Key", Config.getConfig().getServerKey());

        String resp;
        try {
            resp = HttpUtils.post(baseUrl + "/api/mc/register",
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
        if (parsed != null && parsed.has("user")) {
            markBound(player);
            JsonObject user = parsed.getAsJsonObject("user");
            String regUsername = user.has("username") ? user.get("username").getAsString() : username;
            player.sendMessage(LangUtils.getLang("register.success",
                    Map.of("{username}", regUsername)));
            return;
        }

        String msg = null;
        if (parsed != null) {
            if (parsed.has("error")) msg = parsed.get("error").getAsString();
            else if (parsed.has("message")) msg = parsed.get("message").getAsString();
        }
        if (msg != null && msg.contains("已绑定")) {
            markBound(player);
            player.sendMessage(LangUtils.getLang("bind.already_bound"));
            return;
        }
        player.sendMessage(LangUtils.getLang("errors.api_failed",
                Map.of("{message}", msg == null ? "invalid response" : msg)));
    }

    private void markBound(Player player) {
        PlayerBind bind = PlayerData.getPlayerBind(player, true, true);
        bind.setBound(true);
        PlayerData.setPlayerBind(player, bind);
    }

    private String trimTrailingSlash(String url) {
        if (url == null) return "";
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
