package ink.neokoni.lightTickets.Commands.Functions;

import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.LightTickets;
import ink.neokoni.lightTickets.Utils.HttpUtils;
import ink.neokoni.lightTickets.Utils.JsonUtils;
import ink.neokoni.lightTickets.Utils.LangUtils;
import net.kyori.adventure.text.Component;
import org.bukkit.entity.Player;

import java.util.Map;

public class TicketInfo {
    public TicketInfo(Player player, int ticketId) {
        try {
            run(player, ticketId);
        } catch (Throwable t) {
            LightTickets.getInstance().getLogger().log(java.util.logging.Level.SEVERE,
                    "Error while fetching ticket info for " + player.getName(), t);
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", t.getClass().getSimpleName() + ": "
                            + (t.getMessage() == null ? LangUtils.getRawLang("errors.no_message") : t.getMessage()))));
        }
    }

    private void run(Player player, int ticketId) {
        String baseUrl = trimTrailingSlash(Config.getConfig().getBaseUrl());
        String url = baseUrl + "/api/tickets/" + ticketId;
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
            player.sendMessage(LangUtils.getLang("ticket.info_not_found",
                    Map.of("{id}", String.valueOf(ticketId))));
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
        String title = parsed.has("title") ? parsed.get("title").getAsString() : "";
        String status = parsed.has("status") ? parsed.get("status").getAsString() : "";
        String body = parsed.has("body") ? parsed.get("body").getAsString() : "";
        String template = parsed.has("template") ? parsed.get("template").getAsString() : "";
        String priority = parsed.has("priority") ? parsed.get("priority").getAsString() : "";
        String createdAt = parsed.has("createdAt") ? parsed.get("createdAt").getAsString() : "";
        String updatedAt = parsed.has("updatedAt") ? parsed.get("updatedAt").getAsString() : "";

        String authorName = "";
        if (parsed.has("author") && parsed.get("author").isJsonObject()) {
            JsonObject author = parsed.getAsJsonObject("author");
            authorName = author.has("username") ? author.get("username").getAsString() : "";
        }

        String statusColor = statusColor(status);
        String statusText = statusLabel(status);
        String priorityText = priorityLabel(priority);

        player.sendMessage(LangUtils.getLang("ticket.info_title",
                Map.of("{id}", String.valueOf(id), "{title}", title)));
        player.sendMessage(LangUtils.getLang("ticket.info_status",
                Map.of("{status_color}", statusColor, "{status}", statusText)));
        player.sendMessage(LangUtils.getLang("ticket.info_priority",
                Map.of("{priority}", priorityText)));
        player.sendMessage(LangUtils.getLang("ticket.info_template",
                Map.of("{template}", template)));
        player.sendMessage(LangUtils.getLang("ticket.info_author",
                Map.of("{author}", authorName)));
        player.sendMessage(LangUtils.getLang("ticket.info_created",
                Map.of("{date}", formatDate(createdAt))));
        player.sendMessage(LangUtils.getLang("ticket.info_updated",
                Map.of("{date}", formatDate(updatedAt))));

        String trimmedBody = body.length() > 500 ? body.substring(0, 500) + "..." : body;
        player.sendMessage(LangUtils.getLang("ticket.info_body",
                Map.of("{body}", trimmedBody)));
    }

    private String statusColor(String status) {
        return switch (status) {
            case "open" -> "#4ade80";
            case "in_progress" -> "#facc15";
            case "resolved" -> "#96bfff";
            case "closed" -> "#94a3b8";
            case "rejected" -> "#ff8181";
            default -> "#ffffff";
        };
    }

    private String statusLabel(String status) {
        String key = "ticket.status_" + status;
        String label = LangUtils.getRawLang(key);
        if (label.isEmpty()) {
            return LangUtils.getRawLang("ticket.status_open");
        }
        return label;
    }

    private String priorityLabel(String priority) {
        String key = "ticket.priority_" + priority;
        String label = LangUtils.getRawLang(key);
        if (label.isEmpty()) {
            return LangUtils.getRawLang("ticket.priority_medium");
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
