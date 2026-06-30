package ink.neokoni.lightTickets.Commands.Functions;

import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.LightTickets;
import ink.neokoni.lightTickets.Utils.HttpUtils;
import ink.neokoni.lightTickets.Utils.JsonUtils;
import ink.neokoni.lightTickets.Utils.LangUtils;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import net.kyori.adventure.text.format.TextColor;
import net.kyori.adventure.text.minimessage.MiniMessage;
import org.bukkit.entity.Player;

import java.util.Map;

public class BindAccount {
    public BindAccount(Player player) {
        try {
            run(player);
        } catch (Throwable t) {
            LightTickets.getInstance().getLogger().log(java.util.logging.Level.SEVERE,
                    "Error while binding account for " + player.getName(), t);
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", t.getClass().getSimpleName() + ": "
                            + (t.getMessage() == null ? "no message" : t.getMessage()))));
        }
    }

    private void run(Player player) {
        String baseUrl = trimTrailingSlash(Config.getConfig().getBaseUrl());
        JsonObject body = new JsonObject();
        body.addProperty("minecraftUuid", player.getUniqueId().toString());
        body.addProperty("minecraftName", player.getName());
        Map<String, String> headers = Map.of(
                "Content-Type", "application/json",
                "X-Server-Key", Config.getConfig().getServerKey());

        String resp;
        try {
            resp = HttpUtils.post(baseUrl + "/api/mc/link-code",
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
        if (parsed == null || !parsed.has("code")) {
            String msg = parsed != null && parsed.has("error") ? parsed.get("error").getAsString() : "invalid response";
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", msg)));
            return;
        }
        String code = parsed.get("code").getAsString();
        String expiresAt = parsed.has("expiresAt") ? parsed.get("expiresAt").getAsString() : "";

        player.sendMessage(LangUtils.getLang("bind.guide"));
        player.sendMessage(buildCodeMessage(code, expiresAt));
    }

    private Component buildCodeMessage(String code, String expiresAt) {
        String prefix = LangUtils.prefix();
        String raw = LangUtils.getRawLang("bind.code", Map.of("{expiresAt}", expiresAt));
        String placeholder = "{code}";
        int idx = raw.indexOf(placeholder);

        Component codeComp = Component.text(code)
                .color(TextColor.fromHexString("#96bfff"))
                .clickEvent(ClickEvent.copyToClipboard(code))
                .hoverEvent(HoverEvent.showText(
                        MiniMessage.miniMessage().deserialize(LangUtils.getRawLang("bind.copy_hint"))));

        if (idx < 0) {
            return MiniMessage.miniMessage().deserialize(prefix + raw);
        }
        String before = raw.substring(0, idx);
        String after = raw.substring(idx + placeholder.length());
        return MiniMessage.miniMessage().deserialize(prefix + before)
                .append(codeComp)
                .append(MiniMessage.miniMessage().deserialize(after));
    }

    private String trimTrailingSlash(String url) {
        if (url == null) return "";
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}