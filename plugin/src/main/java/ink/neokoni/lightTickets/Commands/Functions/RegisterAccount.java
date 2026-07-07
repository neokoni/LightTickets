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

public class RegisterAccount {
    public RegisterAccount(Player player, String username, String email, String password) {
        try {
            run(player, username, email, password);
        } catch (Throwable t) {
            LogUtils.severe("logs.register_failed",
                    Map.of("{player}", player.getName(), "{message}", LogUtils.exceptionText(t)));
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", LogUtils.exceptionText(t))));
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

        JsonObject body = new JsonObject();
        body.addProperty("email", email);
        body.addProperty("password", password);
        body.addProperty("username", username);
        body.addProperty("minecraftUuid", player.getUniqueId().toString());
        body.addProperty("minecraftName", player.getName());

        HttpUtils.Resp resp;
        try {
            resp = ApiClient.requestWithStatus(ApiEndpoint.MC_REGISTER, JsonUtils.toJson(body));
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
        if (parsed != null && parsed.has("user")) {
            markBound(player);
            JsonObject user = parsed.getAsJsonObject("user");
            String regUsername = user.has("username") ? user.get("username").getAsString() : username;
            player.sendMessage(LangUtils.getLang("register.success",
                    Map.of("{username}", regUsername)));
            return;
        }

        player.sendMessage(LangUtils.getLang("errors.api_failed",
                Map.of("{message}", ApiClient.errorMessage(parsed))));
    }

    private void markBound(Player player) {
        PlayerBind bind = PlayerData.getPlayerBind(player, true, true);
        bind.setBound(true);
        bind.setRole("player");
        PlayerData.setPlayerBind(player, bind);
    }

}
