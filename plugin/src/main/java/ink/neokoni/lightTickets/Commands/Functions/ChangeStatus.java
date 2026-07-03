package ink.neokoni.lightTickets.Commands.Functions;

import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.Configs.Datas.PlayerBind;
import ink.neokoni.lightTickets.Configs.PlayerData;
import ink.neokoni.lightTickets.LightTickets;
import ink.neokoni.lightTickets.Utils.HttpUtils;
import ink.neokoni.lightTickets.Utils.JsonUtils;
import ink.neokoni.lightTickets.Utils.LangUtils;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import net.kyori.adventure.text.minimessage.MiniMessage;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.util.Map;

public class ChangeStatus {
    private static final String[] STATUSES = {"open", "in_progress", "resolved", "closed"};
    private static final String[] PLAYER_STATUSES = {"open", "resolved"};

    public ChangeStatus(Player player, int ticketId) {
        Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(), task -> {
            try {
                showStatusPicker(player, ticketId);
            } catch (Throwable t) {
                LightTickets.getInstance().getLogger().log(java.util.logging.Level.SEVERE,
                        "Error showing status picker for " + player.getName(), t);
                player.sendMessage(LangUtils.getLang("errors.api_failed",
                        Map.of("{message}", t.getClass().getSimpleName() + ": "
                                + (t.getMessage() == null ? LangUtils.getRawLang("errors.no_message") : t.getMessage()))));
            }
        });
    }

    public ChangeStatus(Player player, int ticketId, String newStatus) {
        Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(), task -> {
            try {
                doChange(player, ticketId, newStatus);
            } catch (Throwable t) {
                LightTickets.getInstance().getLogger().log(java.util.logging.Level.SEVERE,
                        "Error changing status for " + player.getName(), t);
                player.sendMessage(LangUtils.getLang("errors.api_failed",
                        Map.of("{message}", t.getClass().getSimpleName() + ": "
                                + (t.getMessage() == null ? LangUtils.getRawLang("errors.no_message") : t.getMessage()))));
            }
        });
    }

    private void showStatusPicker(Player player, int ticketId) {
        player.sendMessage(LangUtils.getLang("ticket.status_picker_header"));
        Component prefixComp = LangUtils.prefixComponent();
        for (String status : allowedStatuses(player)) {
            String label = statusLabel(status);
            String color = statusColor(status);
            String raw = LangUtils.getRawLang("ticket.status_picker_item",
                    Map.of("{color}", color, "{status}", label));
            Component item = prefixComp.append(MiniMessage.miniMessage().deserialize(raw))
                    .clickEvent(ClickEvent.runCommand("/lit ticket status " + ticketId + " " + status))
                    .hoverEvent(HoverEvent.showText(MiniMessage.miniMessage().deserialize(
                            LangUtils.getRawLang("ticket.status_picker_hover"))));
            player.sendMessage(item);
        }
    }

    private void doChange(Player player, int ticketId, String newStatus) {
        if (!canUseStatus(player, newStatus)) {
            player.sendMessage(LangUtils.getLang("ticket.status_no_permission"));
            return;
        }

        String baseUrl = trimTrailingSlash(Config.getConfig().getBaseUrl());
        String url = baseUrl + "/api/mc/tickets/" + ticketId + "/status";

        JsonObject reqBody = new JsonObject();
        reqBody.addProperty("minecraftUuid", player.getUniqueId().toString());
        reqBody.addProperty("status", newStatus);

        Map<String, String> headers = Map.of(
                "Content-Type", "application/json",
                "X-Server-Key", Config.getConfig().getServerKey());

        HttpUtils.Resp resp;
        try {
            resp = HttpUtils.postWithStatus(url, JsonUtils.toJson(reqBody), headers);
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
                if (errObj != null && errObj.has("error")) {
                    msg = errObj.get("error").getAsString();
                }
            } catch (Exception ignored) {
            }
            player.sendMessage(LangUtils.getLang("ticket.status_change_failed",
                    Map.of("{message}", msg)));
            return;
        }

        String label = statusLabel(newStatus);
        player.sendMessage(LangUtils.getLang("ticket.status_changed",
                Map.of("{status}", label)));
    }

    private String[] allowedStatuses(Player player) {
        return isStatusAdmin(player) ? STATUSES : PLAYER_STATUSES;
    }

    private boolean canUseStatus(Player player, String status) {
        if (isStatusAdmin(player)) return true;
        return "open".equals(status) || "resolved".equals(status);
    }

    private boolean isStatusAdmin(Player player) {
        String role = resolveAccountRole(player);
        return "staff".equals(role) || "admin".equals(role);
    }

    private String resolveAccountRole(Player player) {
        PlayerBind bind = PlayerData.getPlayerBind(player, true, false);
        String cachedRole = bind == null || bind.getRole() == null ? "player" : bind.getRole();

        String baseUrl = trimTrailingSlash(Config.getConfig().getBaseUrl());
        String url = baseUrl + "/api/mc/user/" + player.getUniqueId().toString();
        Map<String, String> headers = Map.of("X-Server-Key", Config.getConfig().getServerKey());

        try {
            HttpUtils.Resp resp = HttpUtils.getWithStatus(url, headers);
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

    private String statusColor(String status) {
        return switch (status) {
            case "open" -> "#4ade80";
            case "in_progress" -> "#facc15";
            case "resolved" -> "#96bfff";
            case "closed" -> "#94a3b8";
            default -> "#ffffff";
        };
    }

    private String statusLabel(String status) {
        String key = "ticket.status_" + status;
        String label = LangUtils.getRawLang(key);
        if (label.isEmpty()) return status;
        return label;
    }

    private String trimTrailingSlash(String url) {
        if (url == null) return "";
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
