package ink.neokoni.lightTickets.Commands.Functions;

import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Datas.PlayerBind;
import ink.neokoni.lightTickets.Configs.PlayerData;
import ink.neokoni.lightTickets.Utils.AccountRole;
import ink.neokoni.lightTickets.Utils.ApiClient;
import ink.neokoni.lightTickets.Utils.ApiEndpoint;
import ink.neokoni.lightTickets.Utils.HttpUtils;
import ink.neokoni.lightTickets.Utils.JsonUtils;
import ink.neokoni.lightTickets.Utils.LangUtils;
import ink.neokoni.lightTickets.Utils.LogUtils;
import ink.neokoni.lightTickets.Utils.PlayerSessionManager;
import ink.neokoni.lightTickets.Utils.TicketStatus;
import ink.neokoni.lightTickets.Utils.ValidityUtils;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import ink.neokoni.lightTickets.platform.LightPlayer;

import java.net.URI;
import java.util.Map;

public class RegisterAccount {
    public RegisterAccount(LightPlayer player) {
        try {
            run(player);
        } catch (Throwable t) {
            LogUtils.severe("logs.register_failed",
                    Map.of("{player}", player.getName(), "{message}", LogUtils.exceptionText(t)));
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", LogUtils.exceptionText(t))));
        }
    }

    private void run(LightPlayer player) {
        PlayerBind cached = PlayerData.getPlayerBind(player, true, false);
        if (cached != null && cached.isBound()) {
            if (cached.getPlayerCredential() == null || cached.getPlayerCredential().isBlank()) {
                cached.setBound(false);
                cached.setRole(AccountRole.PLAYER);
                PlayerData.setPlayerBind(player, cached);
                player.sendMessage(LangUtils.getLang("errors.rebind_required"));
                return;
            }
            player.sendMessage(LangUtils.getLang("bind.already_bound"));
            return;
        }

        JsonObject body = new JsonObject();
        body.addProperty("minecraftUuid", player.getUniqueId().toString());
        body.addProperty("minecraftName", player.getName());

        HttpUtils.Resp resp;
        try {
            resp = ApiClient.requestWithStatus(player, ApiEndpoint.MC_REGISTER_LINK, JsonUtils.toJson(body));
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
        if (resp.status() == 409) {
            player.sendMessage(LangUtils.getLang("bind.already_bound"));
            return;
        }
        if (parsed == null || !parsed.has("url") || !parsed.has("playerCredential")) {
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", ApiClient.errorMessage(parsed))));
            return;
        }

        String url = parsed.get("url").getAsString();
        String expiresAt = parsed.has("expiresAt") ? parsed.get("expiresAt").getAsString() : "";
        String playerCredential = parsed.get("playerCredential").getAsString();

        PlayerBind bind = PlayerData.getPlayerBind(player, true, true);
        bind.setBindCode("");
        bind.setCodeExpiresAt(expiresAt);
        bind.setBound(false);
        bind.setRole(AccountRole.PLAYER);
        bind.setPlayerCredential(playerCredential);
        PlayerData.setPlayerBind(player, bind);
        PlayerSessionManager.invalidate(player.getUniqueId());

        player.sendMessage(LangUtils.getLang("register.guide"));
        player.sendMessage(buildLinkMessage(url, expiresAt));
    }

    private Component buildLinkMessage(String url, String expiresAt) {
        Component linkComp = Component.text(url)
                .color(TicketStatus.CLOSED.textColor())
                .clickEvent(clickEvent(url))
                .hoverEvent(HoverEvent.showText(LangUtils.getLangContent("register.link_hover")));

        return LangUtils.getLang("register.link",
                Map.of("{validity}", ValidityUtils.formatRemaining(expiresAt)),
                Map.of("{url}", linkComp));
    }

    private ClickEvent clickEvent(String url) {
        try {
            URI uri = new URI(url);
            String scheme = uri.getScheme();
            if (scheme != null && (scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
                return ClickEvent.openUrl(uri.toString());
            }
        } catch (Exception ignored) {
            // Fall through to the clipboard fallback below.
        }
        return ClickEvent.copyToClipboard(url);
    }
}
