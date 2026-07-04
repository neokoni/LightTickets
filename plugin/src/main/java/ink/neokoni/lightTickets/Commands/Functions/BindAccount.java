package ink.neokoni.lightTickets.Commands.Functions;

import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.Configs.Datas.PlayerBind;
import ink.neokoni.lightTickets.Configs.PlayerData;
import ink.neokoni.lightTickets.Utils.HttpUtils;
import ink.neokoni.lightTickets.Utils.JsonUtils;
import ink.neokoni.lightTickets.Utils.LangUtils;
import ink.neokoni.lightTickets.Utils.LogUtils;
import ink.neokoni.lightTickets.Utils.TicketStatus;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import net.kyori.adventure.text.minimessage.MiniMessage;
import org.bukkit.entity.Player;

import java.util.Map;

public class BindAccount {
    public BindAccount(Player player) {
        try {
            run(player);
        } catch (Throwable t) {
            LogUtils.severe("logs.bind_failed",
                    Map.of("{player}", player.getName(), "{message}", LogUtils.exceptionText(t)));
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", LogUtils.exceptionText(t))));
        }
    }

    private void run(Player player) {
        PlayerBind cached = PlayerData.getPlayerBind(player, true, false);
        if (cached != null && cached.isBound()) {
            player.sendMessage(LangUtils.getLang("bind.already_bound"));
            return;
        }

        String baseUrl = trimTrailingSlash(Config.getConfig().getBaseUrl());
        JsonObject body = new JsonObject();
        body.addProperty("minecraftUuid", player.getUniqueId().toString());
        body.addProperty("minecraftName", player.getName());
        Map<String, String> headers = Map.of(
                "Content-Type", "application/json",
                "X-Server-Key", Config.getConfig().getServerKey());

        HttpUtils.Resp resp;
        try {
            resp = HttpUtils.postWithStatus(baseUrl + "/api/mc/link-code",
                    JsonUtils.toJson(body), headers);
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

        if (resp.status() == 409) {
            markBound(player);
            player.sendMessage(LangUtils.getLang("bind.already_bound"));
            return;
        }

        JsonObject parsed = JsonUtils.fromJson(resp.body(), JsonObject.class);
        if (parsed == null || !parsed.has("code")) {
            String msg = parsed != null && parsed.has("error") ? parsed.get("error").getAsString() : LangUtils.getRawLang("errors.invalid_response");
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", msg)));
            return;
        }
        String code = parsed.get("code").getAsString();
        String expiresAt = parsed.has("expiresAt") ? parsed.get("expiresAt").getAsString() : "";

        player.sendMessage(LangUtils.getLang("bind.guide"));
        player.sendMessage(buildCodeMessage(code, expiresAt));
    }

    private void markBound(Player player) {
        PlayerBind bind = PlayerData.getPlayerBind(player, true, true);
        bind.setBound(true);
        PlayerData.setPlayerBind(player, bind);
    }

    private Component buildCodeMessage(String code, String expiresAt) {
        String raw = LangUtils.getRawLang("bind.code", Map.of("{expiresAt}", expiresAt));
        String placeholder = "{code}";
        int idx = raw.indexOf(placeholder);

        Component codeComp = Component.text(code)
                .color(TicketStatus.CLOSED.textColor())
                .clickEvent(ClickEvent.copyToClipboard(code))
                .hoverEvent(HoverEvent.showText(
                        MiniMessage.miniMessage().deserialize(LangUtils.getRawLang("bind.copy_hint"))));

        if (idx < 0) {
            return LangUtils.prefixComponent().append(MiniMessage.miniMessage().deserialize(raw));
        }
        String before = raw.substring(0, idx);
        String after = raw.substring(idx + placeholder.length());
        return LangUtils.prefixComponent()
                .append(MiniMessage.miniMessage().deserialize(before))
                .append(codeComp)
                .append(MiniMessage.miniMessage().deserialize(after));
    }

    private String trimTrailingSlash(String url) {
        if (url == null) return "";
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
