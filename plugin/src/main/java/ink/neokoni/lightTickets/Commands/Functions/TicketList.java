package ink.neokoni.lightTickets.Commands.Functions;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.Configs.PlayerData;
import ink.neokoni.lightTickets.LightTickets;
import ink.neokoni.lightTickets.Utils.HttpUtils;
import ink.neokoni.lightTickets.Utils.JsonUtils;
import ink.neokoni.lightTickets.Utils.LangUtils;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import net.kyori.adventure.text.minimessage.MiniMessage;
import org.bukkit.entity.Player;

import java.util.List;
import java.util.Map;

public class TicketList {
    public TicketList(Player player, int page) {
        try {
            run(player, page);
        } catch (Throwable t) {
            LightTickets.getInstance().getLogger().log(java.util.logging.Level.SEVERE,
                    "Error while listing tickets for " + player.getName(), t);
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", t.getClass().getSimpleName() + ": "
                            + (t.getMessage() == null ? LangUtils.getRawLang("errors.no_message") : t.getMessage()))));
        }
    }

    private void run(Player player, int page) {
        if (page < 1) page = 1;

        List<PlayerData.CachedTicket> cached = PlayerData.getTicketList(player.getUniqueId());
        if (page == 1 && !cached.isEmpty()) {
            displayFromCache(player, cached);
            return;
        }

        fetchFromApi(player, page);
    }

    private void displayFromCache(Player player, List<PlayerData.CachedTicket> tickets) {
        int pageSize = 10;
        int total = tickets.size();
        int totalPages = (int) Math.ceil((double) total / pageSize);
        if (totalPages < 1) totalPages = 1;

        if (tickets.isEmpty()) {
            player.sendMessage(LangUtils.getLang("ticket.list_empty"));
            return;
        }

        player.sendMessage(LangUtils.getLang("ticket.list_header",
                Map.of("{page}", "1", "{total}", String.valueOf(totalPages))));

        for (PlayerData.CachedTicket t : tickets) {
            player.sendMessage(buildTicketLine(t.id(), t.title(), t.status(), t.createdAt()));
        }

        sendPagination(player, 1, totalPages);
    }

    private void fetchFromApi(Player player, int page) {
        String baseUrl = trimTrailingSlash(Config.getConfig().getBaseUrl());
        String url = baseUrl + "/api/mc/tickets/" + player.getUniqueId().toString()
                + "?page=" + page + "&pageSize=10";
        Map<String, String> headers = Map.of("X-Server-Key", Config.getConfig().getServerKey());

        String resp;
        try {
            resp = HttpUtils.get(url, headers);
        } catch (RuntimeException e) {
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", e.getMessage() == null ? LangUtils.getRawLang("errors.unknown") : e.getMessage())));
            return;
        }
        if (resp == null || resp.isEmpty()) {
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", LangUtils.getRawLang("errors.empty_response"))));
            return;
        }

        JsonObject parsed = JsonUtils.fromJson(resp, JsonObject.class);
        if (parsed == null || !parsed.has("tickets")) {
            String msg = parsed != null && parsed.has("error") ? parsed.get("error").getAsString() : LangUtils.getRawLang("errors.invalid_response");
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", msg)));
            return;
        }

        JsonArray tickets = parsed.getAsJsonArray("tickets");
        int total = parsed.has("total") ? parsed.get("total").getAsInt() : tickets.size();
        int respPage = parsed.has("page") ? parsed.get("page").getAsInt() : page;
        int pageSize = parsed.has("pageSize") ? parsed.get("pageSize").getAsInt() : 10;
        int totalPages = (int) Math.ceil((double) total / pageSize);
        if (totalPages < 1) totalPages = 1;

        if (tickets.size() == 0) {
            player.sendMessage(LangUtils.getLang("ticket.list_empty"));
            return;
        }

        player.sendMessage(LangUtils.getLang("ticket.list_header",
                Map.of("{page}", String.valueOf(respPage), "{total}", String.valueOf(totalPages))));

        for (JsonElement el : tickets) {
            JsonObject t = el.getAsJsonObject();
            int id = t.get("id").getAsInt();
            String title = t.has("title") ? t.get("title").getAsString() : "";
            String status = t.has("status") ? t.get("status").getAsString() : "";
            String createdAt = t.has("createdAt") ? t.get("createdAt").getAsString() : "";

            player.sendMessage(buildTicketLine(id, title, status, createdAt));
        }

        sendPagination(player, respPage, totalPages);
    }

    private Component buildTicketLine(int id, String title, String status, String createdAt) {
        String statusColor = statusColor(status);
        String statusText = statusLabel(status);
        String date = createdAt.length() >= 10 ? createdAt.substring(0, 10) : createdAt;

        String line = LangUtils.getRawLang("ticket.list_item",
                Map.of("{id}", String.valueOf(id),
                       "{title}", title,
                       "{status_color}", statusColor,
                       "{status}", statusText,
                       "{date}", date));

        Component textComp = LangUtils.prefixComponent().append(MiniMessage.miniMessage().deserialize(line));
        Component hover = MiniMessage.miniMessage().deserialize(
                LangUtils.getRawLang("ticket.list_item_hover"));
        return textComp
                .clickEvent(ClickEvent.runCommand("/lit ticket info " + id))
                .hoverEvent(HoverEvent.showText(hover));
    }

    private void sendPagination(Player player, int currentPage, int totalPages) {
        Component prefixComp = LangUtils.prefixComponent();
        Component line = Component.empty();
        if (currentPage > 1) {
            String prevRaw = LangUtils.getRawLang("ticket.list_prev");
            line = line.append(prefixComp.append(MiniMessage.miniMessage().deserialize(prevRaw))
                    .clickEvent(ClickEvent.runCommand("/lit ticket list " + (currentPage - 1)))
                    .hoverEvent(HoverEvent.showText(MiniMessage.miniMessage().deserialize(
                            LangUtils.getRawLang("ticket.list_prev_hover")))));
        }
        String infoRaw = LangUtils.getRawLang("ticket.list_page_info",
                Map.of("{page}", String.valueOf(currentPage), "{total}", String.valueOf(totalPages)));
        line = line.append(Component.text(" "))
                .append(MiniMessage.miniMessage().deserialize(infoRaw))
                .append(Component.text(" "));
        if (currentPage < totalPages) {
            String nextRaw = LangUtils.getRawLang("ticket.list_next");
            line = line.append(prefixComp.append(MiniMessage.miniMessage().deserialize(nextRaw))
                    .clickEvent(ClickEvent.runCommand("/lit ticket list " + (currentPage + 1)))
                    .hoverEvent(HoverEvent.showText(MiniMessage.miniMessage().deserialize(
                            LangUtils.getRawLang("ticket.list_next_hover")))));
        }
        player.sendMessage(line);
    }

    private String statusColor(String status) {
        return switch (status) {
            case "open" -> "#4ade80";
            case "in_progress" -> "#facc15";
            case "closed" -> "#96bfff";
            case "invalid" -> "#94a3b8";
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

    private String trimTrailingSlash(String url) {
        if (url == null) return "";
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
