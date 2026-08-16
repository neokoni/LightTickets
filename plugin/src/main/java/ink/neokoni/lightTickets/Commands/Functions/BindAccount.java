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
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import org.bukkit.entity.Player;

import java.time.Instant;
import java.time.format.DateTimeParseException;
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
            resp = ApiClient.requestWithStatus(ApiEndpoint.MC_LINK_CODE, JsonUtils.toJson(body));
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
            player.sendMessage(LangUtils.getLang("errors.rebind_required"));
            return;
        }

        JsonObject parsed = JsonUtils.fromJson(resp.body(), JsonObject.class);
        if (parsed == null || !parsed.has("code") || !parsed.has("playerCredential")) {
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", ApiClient.errorMessage(parsed))));
            return;
        }
        String code = parsed.get("code").getAsString();
        String expiresAt = parsed.has("expiresAt") ? parsed.get("expiresAt").getAsString() : "";
        String playerCredential = parsed.get("playerCredential").getAsString();

        PlayerBind bind = PlayerData.getPlayerBind(player, true, true);
        bind.setBindCode(code);
        bind.setCodeExpiresAt(expiresAt);
        bind.setBound(false);
        bind.setRole(AccountRole.PLAYER);
        bind.setPlayerCredential(playerCredential);
        PlayerData.setPlayerBind(player, bind);
        PlayerSessionManager.invalidate(player.getUniqueId());

        player.sendMessage(LangUtils.getLang("bind.guide"));
        player.sendMessage(buildCodeMessage(code, expiresAt));
    }

    private Component buildCodeMessage(String code, String expiresAt) {
        Component codeComp = Component.text(code)
                .color(TicketStatus.CLOSED.textColor())
                .clickEvent(ClickEvent.copyToClipboard(code))
                .hoverEvent(HoverEvent.showText(LangUtils.getLangContent("bind.copy_hint")));

        return LangUtils.getLang("bind.code", Map.of("{validity}", formatValidity(expiresAt)),
                Map.of("{code}", codeComp));
    }

    private String formatValidity(String expiresAt) {
        try {
            long remainingMillis = Instant.parse(expiresAt).toEpochMilli() - System.currentTimeMillis();
            long minutes = Math.max(1, (long) Math.ceil(remainingMillis / 60_000.0));
            return LangUtils.getRawLang("bind.validity", Map.of("{minutes}", String.valueOf(minutes)));
        } catch (DateTimeParseException | NullPointerException e) {
            return expiresAt == null ? "" : expiresAt;
        }
    }

}
