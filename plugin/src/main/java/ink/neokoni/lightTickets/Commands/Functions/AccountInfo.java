package ink.neokoni.lightTickets.Commands.Functions;

import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.Configs.Datas.PlayerBind;
import ink.neokoni.lightTickets.Configs.PlayerData;
import ink.neokoni.lightTickets.Utils.HttpUtils;
import ink.neokoni.lightTickets.Utils.JsonUtils;
import ink.neokoni.lightTickets.Utils.LangUtils;
import ink.neokoni.lightTickets.Utils.LogUtils;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import net.kyori.adventure.text.minimessage.MiniMessage;
import org.bukkit.entity.Player;

import java.util.Map;

public class AccountInfo {
    public AccountInfo(Player player) {
        try {
            run(player);
        } catch (Throwable t) {
            LogUtils.severe("logs.account_info_failed",
                    Map.of("{player}", player.getName(), "{message}", LogUtils.exceptionText(t)));
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", LogUtils.exceptionText(t))));
        }
    }

    private void run(Player player) {
        String baseUrl = trimTrailingSlash(Config.getConfig().getBaseUrl());
        String url = baseUrl + "/api/mc/user/" + player.getUniqueId().toString();
        Map<String, String> headers = Map.of("X-Server-Key", Config.getConfig().getServerKey());

        HttpUtils.Resp resp;
        try {
            resp = HttpUtils.getWithStatus(url, headers);
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

        if (resp.status() == 404) {
            player.sendMessage(LangUtils.getLang("account.not_bound"));
            return;
        }

        JsonObject parsed = JsonUtils.fromJson(resp.body(), JsonObject.class);
        if (parsed == null || !parsed.has("id")) {
            String msg = parsed != null && parsed.has("error") ? parsed.get("error").getAsString() : LangUtils.getRawLang("errors.invalid_response");
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", msg)));
            return;
        }

        int id = parsed.get("id").getAsInt();
        String username = parsed.has("username") ? parsed.get("username").getAsString() : "";
        String email = parsed.has("email") ? parsed.get("email").getAsString() : "";
        String role = parsed.has("role") ? parsed.get("role").getAsString() : "";
        String mcName = parsed.has("minecraftName") && !parsed.get("minecraftName").isJsonNull()
                ? parsed.get("minecraftName").getAsString() : "";
        String createdAt = parsed.has("createdAt") ? parsed.get("createdAt").getAsString() : "";

        PlayerBind bind = PlayerData.getPlayerBind(player, true, true);
        bind.setBound(true);
        bind.setRole(role == null || role.isEmpty() ? "player" : role);
        PlayerData.setPlayerBind(player, bind);

        player.sendMessage(buildHeaderWithUnlink());
        player.sendMessage(LangUtils.getLang("account.id",
                Map.of("{id}", String.valueOf(id))));
        player.sendMessage(LangUtils.getLang("account.username",
                Map.of("{username}", username)));
        player.sendMessage(LangUtils.getLang("account.email",
                Map.of("{email}", email)));
        player.sendMessage(LangUtils.getLang("account.role",
                Map.of("{role}", roleLabel(role))));
        player.sendMessage(LangUtils.getLang("account.mc_name",
                Map.of("{mc_name}", mcName)));
        player.sendMessage(LangUtils.getLang("account.created_at",
                Map.of("{date}", formatDate(createdAt))));
    }

    private Component buildHeaderWithUnlink() {
        Component header = LangUtils.getLang("account.header");
        Component unlink = MiniMessage.miniMessage().deserialize(LangUtils.getRawLang("account.unlink_button"))
                .clickEvent(ClickEvent.suggestCommand("/lit unbind"))
                .hoverEvent(HoverEvent.showText(
                        MiniMessage.miniMessage().deserialize(LangUtils.getRawLang("account.unlink_button_hover"))));
        return header.append(Component.text(" ")).append(unlink);
    }

    private String roleLabel(String role) {
        String key = "account.role_" + role;
        String label = LangUtils.getRawLang(key);
        if (label.isEmpty()) {
            return LangUtils.getRawLang("account.role_player");
        }
        return label;
    }

    private String formatDate(String iso) {
        if (iso == null || iso.isEmpty()) return "";
        int tIdx = iso.indexOf('T');
        if (tIdx > 0) return iso.substring(0, tIdx) + " " + iso.substring(tIdx + 1, Math.min(tIdx + 9, iso.length()));
        return iso;
    }

    private String trimTrailingSlash(String url) {
        if (url == null) return "";
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
