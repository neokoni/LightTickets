package ink.neokoni.lightTickets.Commands.Functions;

import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Datas.PlayerBind;
import ink.neokoni.lightTickets.Configs.PlayerData;
import ink.neokoni.lightTickets.LightTickets;
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
import net.kyori.adventure.text.minimessage.MiniMessage;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.util.Map;

public class ChangeStatus {
    public ChangeStatus(Player player, int ticketId) {
        Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(), task -> {
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

    public ChangeStatus(Player player, int ticketId, String newStatus) {
        Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(), task -> {
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

    private void showStatusPicker(Player player, int ticketId) {
        if (!canChangeTicket(player, ticketId, null)) {
            player.sendMessage(LangUtils.getLang("ticket.status_no_permission"));
            return;
        }

        player.sendMessage(LangUtils.getLang("ticket.status_picker_header"));
        Component prefixComp = LangUtils.prefixComponent();
        for (TicketStatus status : allowedStatuses(player)) {
            String label = status.label();
            String color = status.color();
            String raw = LangUtils.getRawLang("ticket.status_picker_item",
                    Map.of("{color}", color, "{status}", label));
            Component item = prefixComp.append(MiniMessage.miniMessage().deserialize(raw))
                    .clickEvent(ClickEvent.runCommand("/lit ticket status " + ticketId + " " + status.key()))
                    .hoverEvent(HoverEvent.showText(MiniMessage.miniMessage().deserialize(
                            LangUtils.getRawLang("ticket.status_picker_hover"))));
            player.sendMessage(item);
        }
    }

    private void doChange(Player player, int ticketId, String newStatus) {
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
            resp = ApiClient.requestWithStatus(ApiEndpoint.MC_UPDATE_TICKET_STATUS,
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

    private TicketStatus[] allowedStatuses(Player player) {
        return isStatusAdmin(player) ? TicketStatus.selectableByStaff() : TicketStatus.selectableByPlayer();
    }

    private boolean canUseStatus(Player player, TicketStatus status) {
        if (isStatusAdmin(player)) return true;
        return status.isPlayerSelectable();
    }

    private boolean canChangeTicket(Player player, int ticketId, TicketStatus nextStatus) {
        if (isStatusAdmin(player)) return true;

        JsonObject ticket = fetchTicket(ticketId);
        if (ticket == null) return false;

        TicketStatus currentStatus = TicketStatus.fromKey(ticket.has("status") && !ticket.get("status").isJsonNull()
                ? ticket.get("status").getAsString()
                : "");
        if (!nextStatus.canPlayerTransitionFrom(currentStatus)) {
            return false;
        }

        int authorId = -1;
        if (ticket.has("authorId") && !ticket.get("authorId").isJsonNull()) {
            authorId = ticket.get("authorId").getAsInt();
        }

        JsonObject account = fetchAccount(player);
        return account != null
                && account.has("id")
                && !account.get("id").isJsonNull()
                && account.get("id").getAsInt() == authorId;
    }

    private JsonObject fetchTicket(int ticketId) {
        try {
            HttpUtils.Resp resp = ApiClient.requestWithStatus(
                    ApiEndpoint.TICKET_DETAIL, Map.of("id", String.valueOf(ticketId)));
            if (resp == null || resp.status() != 200 || resp.body() == null || resp.body().isEmpty()) return null;
            return JsonUtils.fromJson(resp.body(), JsonObject.class);
        } catch (RuntimeException e) {
            return null;
        }
    }

    private JsonObject fetchAccount(Player player) {
        try {
            HttpUtils.Resp resp = ApiClient.requestWithStatus(
                    ApiEndpoint.MC_USER, Map.of("uuid", player.getUniqueId().toString()));
            if (resp == null || resp.status() != 200 || resp.body() == null || resp.body().isEmpty()) return null;
            return JsonUtils.fromJson(resp.body(), JsonObject.class);
        } catch (RuntimeException e) {
            return null;
        }
    }

    public static boolean canChangeAnyStatus(Player player) {
        String role = resolveAccountRole(player);
        return "staff".equals(role) || "admin".equals(role);
    }

    private boolean isStatusAdmin(Player player) {
        return canChangeAnyStatus(player);
    }

    public static String resolveAccountRole(Player player) {
        PlayerBind bind = PlayerData.getPlayerBind(player, true, false);
        String cachedRole = bind == null || bind.getRole() == null ? "player" : bind.getRole();

        try {
            HttpUtils.Resp resp = ApiClient.requestWithStatus(
                    ApiEndpoint.MC_USER, Map.of("uuid", player.getUniqueId().toString()));
            if (resp == null || resp.status() != 200 || resp.body() == null || resp.body().isEmpty()) {
                return cachedRole;
            }

            JsonObject parsed = JsonUtils.fromJson(resp.body(), JsonObject.class);
            if (parsed == null || !parsed.has("role") || parsed.get("role").isJsonNull()) {
                return cachedRole;
            }

            String role = parsed.get("role").getAsString();
            PlayerBind updated = bind == null ? PlayerData.getPlayerBind(player, true, true) : bind;
            updated.setBound(true);
            updated.setRole(role == null || role.isEmpty() ? "player" : role);
            PlayerData.setPlayerBind(player, updated);
            return updated.getRole();
        } catch (RuntimeException e) {
            return cachedRole;
        }
    }
}
