package ink.neokoni.lightTickets.Commands.Functions;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.PlayerData;
import ink.neokoni.lightTickets.Utils.ApiClient;
import ink.neokoni.lightTickets.Utils.ApiEndpoint;
import ink.neokoni.lightTickets.Utils.HttpUtils;
import ink.neokoni.lightTickets.Utils.JsonUtils;
import ink.neokoni.lightTickets.Utils.LangUtils;
import ink.neokoni.lightTickets.Utils.LogUtils;
import ink.neokoni.lightTickets.Utils.TicketSearchParser;
import ink.neokoni.lightTickets.Utils.TicketStatus;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import ink.neokoni.lightTickets.platform.LightPlayer;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class TicketList {
    private static final int PAGE_SIZE = 10;

    public TicketList(LightPlayer player, int page) {
        this(player, page, ListFilter.all());
    }

    public TicketList(LightPlayer player, int page, TicketStatus statusFilter) {
        this(player, page, ListFilter.status(statusFilter));
    }

    public TicketList(LightPlayer player, int page, TicketSearchParser.SearchFilter searchFilter) {
        this(player, page, ListFilter.search(searchFilter));
    }

    private TicketList(LightPlayer player, int page, ListFilter filter) {
        try {
            run(player, page, filter);
        } catch (Throwable t) {
            LogUtils.severe("logs.ticket_list_failed",
                    Map.of("{player}", player.getName(), "{message}", LogUtils.exceptionText(t)));
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", LogUtils.exceptionText(t))));
        }
    }

    private void run(LightPlayer player, int page, ListFilter filter) {
        if (page < 1) page = 1;

        fetchFromApi(player, page, filter);
    }

    private void displayFromCache(LightPlayer player, List<PlayerData.CachedTicket> tickets,
                                  ListFilter filter) {
        if (filter.mode() == FilterMode.STATUS) {
            tickets = tickets.stream()
                    .filter(ticket -> filter.value().equals(ticket.status()))
                    .toList();
        }
        int total = tickets.size();
        int totalPages = (int) Math.ceil((double) total / PAGE_SIZE);
        if (totalPages < 1) totalPages = 1;

        if (tickets.isEmpty()) {
            player.sendMessage(LangUtils.getLang("ticket.list_empty"));
            return;
        }

        sendHeader(player, 1, totalPages, filter);

        for (PlayerData.CachedTicket t : tickets) {
            player.sendMessage(buildTicketLine(t.id(), t.title(), t.status(), t.createdAt()));
        }

        sendPagination(player, 1, totalPages, filter);
    }

    private void fetchFromApi(LightPlayer player, int page, ListFilter filter) {
        Map<String, String> queryParams = new LinkedHashMap<>();
        queryParams.put("minecraftUuid", player.getUniqueId().toString());
        queryParams.put("page", String.valueOf(page));
        queryParams.put("pageSize", String.valueOf(PAGE_SIZE));
        queryParams.putAll(filter.params());

        HttpUtils.Resp resp;
        try {
            resp = ApiClient.requestForMcViewer(player, ApiEndpoint.MC_TICKET_LIST,
                    null, queryParams);
        } catch (RuntimeException e) {
            if (page == 1 && displayCacheFallback(player, filter)) return;
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", e.getMessage() == null ? LangUtils.getRawLang("errors.unknown") : e.getMessage())));
            return;
        }
        if (resp != null && resp.status() == 401) {
            if (page == 1 && displayCacheFallback(player, filter)) return;
            player.sendMessage(LangUtils.getLang("ticket.login_required"));
            return;
        }
        if (resp == null || resp.body() == null || resp.body().isEmpty()) {
            if (page == 1 && displayCacheFallback(player, filter)) return;
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", LangUtils.getRawLang("errors.empty_response"))));
            return;
        }
        if (resp.status() != 200) {
            if (page == 1 && displayCacheFallback(player, filter)) return;
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", ApiClient.errorMessage(JsonUtils.fromJson(resp.body(), JsonObject.class)))));
            return;
        }

        JsonObject parsed = JsonUtils.fromJson(resp.body(), JsonObject.class);
        if (parsed == null || !parsed.has("tickets")) {
            if (page == 1 && displayCacheFallback(player, filter)) return;
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", ApiClient.errorMessage(parsed))));
            return;
        }
        JsonArray tickets = parsed.getAsJsonArray("tickets");
        int total = parsed.has("total") ? parsed.get("total").getAsInt() : tickets.size();
        int respPage = parsed.has("page") ? parsed.get("page").getAsInt() : page;
        int pageSize = parsed.has("pageSize") ? parsed.get("pageSize").getAsInt() : PAGE_SIZE;
        int totalPages = (int) Math.ceil((double) total / pageSize);
        if (totalPages < 1) totalPages = 1;

        if (tickets.size() == 0) {
            if (respPage == 1 && filter.mode() == FilterMode.ALL) {
                PlayerData.setTicketList(player.getUniqueId(), List.of());
            }
            player.sendMessage(LangUtils.getLang("ticket.list_empty"));
            return;
        }

        List<PlayerData.CachedTicket> cacheSnapshot = new ArrayList<>();

        sendHeader(player, respPage, totalPages, filter);

        for (JsonElement el : tickets) {
            JsonObject t = el.getAsJsonObject();
            if (!t.has("id")) continue;
            int id = t.get("id").getAsInt();
            String title = t.has("title") ? t.get("title").getAsString() : "";
            String status = t.has("status") ? t.get("status").getAsString() : "";
            String createdAt = t.has("createdAt") ? t.get("createdAt").getAsString() : "";

            cacheSnapshot.add(new PlayerData.CachedTicket(id, title, status, createdAt));
            player.sendMessage(buildTicketLine(id, title, status, createdAt));
        }

        if (respPage == 1 && filter.mode() == FilterMode.ALL) {
            PlayerData.setTicketList(player.getUniqueId(), cacheSnapshot);
        }

        sendPagination(player, respPage, totalPages, filter);
    }

    private boolean displayCacheFallback(LightPlayer player, ListFilter filter) {
        if (filter.mode() == FilterMode.SEARCH) return false;
        List<PlayerData.CachedTicket> cached = PlayerData.getTicketList(player.getUniqueId());
        if (cached.isEmpty()) return false;
        displayFromCache(player, cached, filter);
        return true;
    }

    private void sendHeader(LightPlayer player, int page, int totalPages, ListFilter filter) {
        Map<String, String> pageValues = Map.of(
                "{page}", String.valueOf(page),
                "{total}", String.valueOf(totalPages));
        switch (filter.mode()) {
            case ALL -> player.sendMessage(LangUtils.getLang("ticket.list_header", pageValues));
            case STATUS -> player.sendMessage(LangUtils.getLang("ticket.list_filtered_header",
                    pageValues, Map.of("{status}", filter.status().label())));
            case SEARCH -> player.sendMessage(LangUtils.getLang("ticket.search_header",
                    pageValues, Map.of("{query}", filter.value())));
        }
    }

    private Component buildTicketLine(int id, String title, String status, String createdAt) {
        TicketStatus ticketStatus = TicketStatus.fromKey(status);
        String statusText = ticketStatus.label();
        String date = createdAt.length() >= 10 ? createdAt.substring(0, 10) : createdAt;

        Component textComp = LangUtils.getLang("ticket.list_display_item",
                Map.of("{id}", String.valueOf(id),
                       "{title}", title,
                       "{date}", date),
                Map.of("{status}", Component.text('[' + statusText + ']', ticketStatus.textColor())));
        Component hover = LangUtils.getLangContent("ticket.list_item_hover");
        return textComp
                .clickEvent(ClickEvent.runCommand("/lit ticket info " + id))
                .hoverEvent(HoverEvent.showText(hover));
    }

    private void sendPagination(LightPlayer player, int currentPage, int totalPages, ListFilter filter) {
        Component prefixComp = LangUtils.prefixComponent();
        Component line = Component.empty();
        if (currentPage > 1) {
            line = line.append(prefixComp.append(LangUtils.getLangContent("ticket.list_prev"))
                    .clickEvent(ClickEvent.runCommand(pageCommand(currentPage - 1, filter)))
                    .hoverEvent(HoverEvent.showText(LangUtils.getLangContent("ticket.list_prev_hover"))));
        }
        line = line.append(Component.text(" "))
                .append(LangUtils.getLangContent("ticket.list_page_info",
                        Map.of("{page}", String.valueOf(currentPage), "{total}", String.valueOf(totalPages))))
                .append(Component.text(" "));
        if (currentPage < totalPages) {
            line = line.append(prefixComp.append(LangUtils.getLangContent("ticket.list_next"))
                    .clickEvent(ClickEvent.runCommand(pageCommand(currentPage + 1, filter)))
                    .hoverEvent(HoverEvent.showText(LangUtils.getLangContent("ticket.list_next_hover"))));
        }
        player.sendMessage(line);
    }

    private String pageCommand(int page, ListFilter filter) {
        return switch (filter.mode()) {
            case ALL -> "/lit ticket list " + page;
            case STATUS -> "/lit ticket list:" + filter.value() + " " + page;
            case SEARCH -> "/lit ticket search --page " + page + " " + filter.value();
        };
    }

    private enum FilterMode {
        ALL,
        STATUS,
        SEARCH
    }

    private record ListFilter(FilterMode mode, String value, Map<String, String> params) {
        private static ListFilter all() {
            return new ListFilter(FilterMode.ALL, "", Map.of());
        }

        private static ListFilter status(TicketStatus status) {
            return new ListFilter(FilterMode.STATUS, status.key(), Map.of("statuses", status.key()));
        }

        private static ListFilter search(TicketSearchParser.SearchFilter search) {
            return new ListFilter(FilterMode.SEARCH, search.rawQuery(), search.params());
        }

        private TicketStatus status() {
            return TicketStatus.fromKey(value);
        }
    }

}
