package ink.neokoni.lightTickets.Commands.Functions;

import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Datas.PlayerBind;
import ink.neokoni.lightTickets.Configs.PlayerData;
import ink.neokoni.lightTickets.platform.LightPlatformProvider;
import ink.neokoni.lightTickets.Utils.AccountRole;
import ink.neokoni.lightTickets.Utils.ApiClient;
import ink.neokoni.lightTickets.Utils.ApiEndpoint;
import ink.neokoni.lightTickets.Utils.DataRefreshManager;
import ink.neokoni.lightTickets.Utils.HttpUtils;
import ink.neokoni.lightTickets.Utils.JsonUtils;
import ink.neokoni.lightTickets.Utils.LangUtils;
import ink.neokoni.lightTickets.Utils.LogUtils;
import ink.neokoni.lightTickets.Utils.TicketStatus;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;

import ink.neokoni.lightTickets.platform.LightPlayer;

import java.util.Map;

public class ChangeStatus {
    public ChangeStatus(LightPlayer player, int ticketId) {
        LightPlatformProvider.get().runAsync(() -> {
            try {
                showStatusPicker(player, ticketId);
            } catch (Throwable t) {
                LogUtils.severe("logs.status_picker_failed",
                        Map.of("{player}", player.getName(), "{message}", LogUtils.exceptionText(t)));
                player.sendMessage(LangUtils.getLang("errors.api_failed",
                        Map.of("{message}", LogUtils.exceptionText(t))));
            }
        });
    }

    public ChangeStatus(LightPlayer player, int ticketId, String newStatus) {
        LightPlatformProvider.get().runAsync(() -> {
            try {
                doChange(player, ticketId, newStatus);
            } catch (Throwable t) {
                LogUtils.severe("logs.status_change_failed",
                        Map.of("{player}", player.getName(), "{message}", LogUtils.exceptionText(t)));
                player.sendMessage(LangUtils.getLang("errors.api_failed",
                        Map.of("{message}", LogUtils.exceptionText(t))));
            }
        });
    }

    private void showStatusPicker(LightPlayer player, int ticketId) {
        if (!canChangeTicket(player, ticketId, null)) {
            player.sendMessage(LangUtils.getLang("ticket.status_no_permission"));
            return;
        }

        player.sendMessage(LangUtils.getLang("ticket.status_picker_header"));
        Component prefixComp = LangUtils.prefixComponent();
        for (TicketStatus status : allowedStatuses(player)) {
            String label = status.label();
            Component labelComponent = Component.text('[' + label + ']', status.textColor());
            Component item = prefixComp.append(LangUtils.getLangContent("ticket.status_picker_label",
                            Map.of(), Map.of("{status}", labelComponent)))
                    .clickEvent(ClickEvent.runCommand("/lit ticket status " + ticketId + " " + status.key()))
                    .hoverEvent(HoverEvent.showText(LangUtils.getLangContent("ticket.status_picker_hover")));
            player.sendMessage(item);
        }
    }

    private void doChange(LightPlayer player, int ticketId, String newStatus) {
        TicketStatus targetStatus = TicketStatus.fromKey(newStatus);
        if (!targetStatus.isKnown() || !canUseStatus(player, targetStatus)
                || !canChangeTicket(player, ticketId, targetStatus)) {
            player.sendMessage(LangUtils.getLang("ticket.status_no_permission"));
            return;
        }

        JsonObject reqBody = new JsonObject();
        reqBody.addProperty("minecraftUuid", player.getUniqueId().toString());
        reqBody.addProperty("status", targetStatus.key());

        HttpUtils.Resp resp;
        try {
            resp = ApiClient.requestWithStatusForPlayer(player, ApiEndpoint.MC_UPDATE_TICKET_STATUS,
                    Map.of("id", String.valueOf(ticketId)), null, JsonUtils.toJson(reqBody));
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

        if (resp.status() == 403) {
            player.sendMessage(LangUtils.getLang("ticket.status_no_permission"));
            return;
        }

        if (resp.status() >= 400) {
            String msg = LangUtils.getRawLang("errors.invalid_response");
            try {
                JsonObject errObj = JsonUtils.fromJson(resp.body(), JsonObject.class);
                msg = ApiClient.errorMessage(errObj);
            } catch (Exception ignored) {
            }
            player.sendMessage(LangUtils.getLang("ticket.status_change_failed",
                    Map.of("{message}", msg)));
            return;
        }

        String label = targetStatus.label();
        player.sendMessage(LangUtils.getLang("ticket.status_changed",
                Map.of("{status}", label)));
        DataRefreshManager.refreshNow(player.getUniqueId());
    }

    private TicketStatus[] allowedStatuses(LightPlayer player) {
        return isStatusAdmin(player) ? TicketStatus.selectableByStaff() : TicketStatus.selectableByPlayer();
    }

    private boolean canUseStatus(LightPlayer player, TicketStatus status) {
        if (isStatusAdmin(player)) return true;
        return status.isPlayerSelectable();
    }

    private boolean canChangeTicket(LightPlayer player, int ticketId, TicketStatus nextStatus) {
        if (isStatusAdmin(player)) return true;

        JsonObject ticket = fetchTicket(player, ticketId);
        if (ticket == null) return false;

        int authorId = -1;
        if (ticket.has("authorId") && !ticket.get("authorId").isJsonNull()) {
            authorId = ticket.get("authorId").getAsInt();
        }

        JsonObject account = fetchAccount(player);
        boolean isAuthor = account != null
                && account.has("id")
                && !account.get("id").isJsonNull()
                && account.get("id").getAsInt() == authorId;
        if (!isAuthor) return false;

        // The picker only needs authorization. A transition check requires a target status.
        if (nextStatus == null) return true;

        TicketStatus currentStatus = TicketStatus.fromKey(ticket.has("status") && !ticket.get("status").isJsonNull()
                ? ticket.get("status").getAsString()
                : "");
        return nextStatus.canPlayerTransitionFrom(currentStatus);
    }

    private JsonObject fetchTicket(LightPlayer player, int ticketId) {
        try {
            HttpUtils.Resp resp = ApiClient.requestWithStatusForPlayer(player,
                    ApiEndpoint.MC_TICKET_DETAIL, Map.of("id", String.valueOf(ticketId)),
                    Map.of("minecraftUuid", player.getUniqueId().toString()), null);
            if (resp == null || resp.status() != 200 || resp.body() == null || resp.body().isEmpty()) return null;
            return JsonUtils.fromJson(resp.body(), JsonObject.class);
        } catch (RuntimeException e) {
            return null;
        }
    }

    private JsonObject fetchAccount(LightPlayer player) {
        try {
            HttpUtils.Resp resp = ApiClient.requestWithStatusForPlayer(player,
                    ApiEndpoint.MC_USER, Map.of("uuid", player.getUniqueId().toString()), null, null);
            if (resp == null || resp.status() != 200 || resp.body() == null || resp.body().isEmpty()) return null;
            return JsonUtils.fromJson(resp.body(), JsonObject.class);
        } catch (RuntimeException e) {
            return null;
        }
    }

    public static boolean canChangeAnyStatus(LightPlayer player) {
        AccountRole role = resolveAccountRole(player);
        return role.isStaff();
    }

    private boolean isStatusAdmin(LightPlayer player) {
        return canChangeAnyStatus(player);
    }

    public static AccountRole resolveAccountRole(LightPlayer player) {
        PlayerBind bind = PlayerData.getPlayerBind(player, true, false);
        AccountRole cachedRole = bind == null || bind.getRole() == null ? AccountRole.PLAYER : bind.getRole();

        try {
            HttpUtils.Resp resp = ApiClient.requestWithStatusForPlayer(player,
                    ApiEndpoint.MC_USER, Map.of("uuid", player.getUniqueId().toString()), null, null);
            if (resp == null || resp.status() != 200 || resp.body() == null || resp.body().isEmpty()) {
                return cachedRole;
            }

            JsonObject parsed = JsonUtils.fromJson(resp.body(), JsonObject.class);
            if (parsed == null || !parsed.has("role") || parsed.get("role").isJsonNull()) {
                return cachedRole;
            }

            AccountRole role = AccountRole.fromKey(parsed.get("role").getAsString());
            PlayerBind updated = bind == null ? PlayerData.getPlayerBind(player, true, true) : bind;
            updated.setBound(true);
            updated.setRole(role);
            PlayerData.setPlayerBind(player, updated);
            return updated.getRole();
        } catch (RuntimeException e) {
            return cachedRole;
        }
    }
}
