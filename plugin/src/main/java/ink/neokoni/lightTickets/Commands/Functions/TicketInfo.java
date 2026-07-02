package ink.neokoni.lightTickets.Commands.Functions;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Config;
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

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class TicketInfo {
    private static final int COMMENTS_PER_PAGE = 5;
    private static final Pattern LINK_PATTERN = Pattern.compile("\\[([^\\]]+)\\]\\((https?://[^\\)]+)\\)");
    private static final Pattern URL_PATTERN = Pattern.compile("(https?://\\S+)");
    private static final Pattern FILE_PATTERN = Pattern.compile("\\[([^\\]]+\\.[a-zA-Z0-9]+)\\]");

    public TicketInfo(Player player, int ticketId) {
        this(player, ticketId, 1);
    }

    public TicketInfo(Player player, int ticketId, int commentPage) {
        try {
            run(player, ticketId, commentPage);
        } catch (Throwable t) {
            LightTickets.getInstance().getLogger().log(java.util.logging.Level.SEVERE,
                    "Error while fetching ticket info for " + player.getName(), t);
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", t.getClass().getSimpleName() + ": "
                            + (t.getMessage() == null ? LangUtils.getRawLang("errors.no_message") : t.getMessage()))));
        }
    }

    private void run(Player player, int ticketId, int commentPage) {
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
        int rawAuthorId = -1;
        if (parsed.has("author") && parsed.get("author").isJsonObject()) {
            JsonObject author = parsed.getAsJsonObject("author");
            authorName = author.has("username") ? author.get("username").getAsString() : "";
            rawAuthorId = author.has("id") ? author.get("id").getAsInt() : -1;
        }
        final int authorId = rawAuthorId;

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

        Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(),
                task -> displayComments(player, id, authorId, commentPage));
    }

    private void displayComments(Player player, int ticketId, int authorId, int page) {
        JsonArray comments = fetchComments(ticketId);
        if (comments == null) {
            return;
        }

        List<JsonObject> commentList = new ArrayList<>();
        for (JsonElement el : comments) {
            commentList.add(el.getAsJsonObject());
        }

        if (commentList.isEmpty()) {
            player.sendMessage(LangUtils.getLang("ticket.comments_empty"));
            sendCommentAddButton(player, ticketId);
            return;
        }

        int totalPages = (int) Math.ceil((double) commentList.size() / COMMENTS_PER_PAGE);
        if (totalPages < 1) totalPages = 1;
        if (page > totalPages) page = totalPages;
        if (page < 1) page = 1;

        player.sendMessage(LangUtils.getLang("ticket.comments_header",
                Map.of("{page}", String.valueOf(page), "{total}", String.valueOf(totalPages))));

        int start = (page - 1) * COMMENTS_PER_PAGE;
        int end = Math.min(start + COMMENTS_PER_PAGE, commentList.size());

        for (int i = start; i < end; i++) {
            JsonObject comment = commentList.get(i);
            String author = "";
            if (comment.has("author") && comment.get("author").isJsonObject()) {
                JsonObject authorObj = comment.getAsJsonObject("author");
                author = authorObj.has("username") ? authorObj.get("username").getAsString() : "";
            }
            String date = comment.has("createdAt") ? comment.get("createdAt").getAsString() : "";
            String commentBody = comment.has("body") ? comment.get("body").getAsString() : "";

            Component commentComp = buildCommentComponent(author, formatDate(date), commentBody, ticketId);
            player.sendMessage(commentComp);
        }

        sendCommentPagination(player, ticketId, authorId, page, totalPages);
        sendCommentAddButton(player, ticketId);
    }

    private JsonArray fetchComments(int ticketId) {
        String baseUrl = trimTrailingSlash(Config.getConfig().getBaseUrl());
        String url = baseUrl + "/api/tickets/" + ticketId + "/comments";
        Map<String, String> headers = Map.of("X-Server-Key", Config.getConfig().getServerKey());

        try {
            HttpUtils.Resp resp = HttpUtils.getWithStatus(url, headers);
            if (resp == null || resp.body() == null || resp.body().isEmpty()) {
                return null;
            }
            if (resp.status() != 200) {
                return null;
            }
            JsonElement parsed = JsonUtils.fromJson(resp.body(), JsonElement.class);
            if (parsed != null && parsed.isJsonArray()) {
                return parsed.getAsJsonArray();
            }
        } catch (Exception e) {
            LightTickets.getInstance().getLogger().log(java.util.logging.Level.WARNING,
                    "Failed to fetch comments for ticket " + ticketId, e);
        }
        return null;
    }

    private Component buildCommentComponent(String author, String date, String body, int ticketId) {
        Component prefixComp = LangUtils.prefixComponent();
        String headerRaw = LangUtils.getRawLang("ticket.comment_item",
                Map.of("{author}", author, "{date}", date, "{body}", ""));

        Component header = MiniMessage.miniMessage().deserialize(headerRaw);
        Component content = formatCommentBody(body);

        return prefixComp.append(header).append(content);
    }

    private Component formatCommentBody(String body) {
        if (body == null || body.isEmpty()) {
            return Component.empty();
        }

        Component result = Component.empty();
        String remaining = body;

        while (!remaining.isEmpty()) {
            Matcher linkMatcher = LINK_PATTERN.matcher(remaining);
            Matcher urlMatcher = URL_PATTERN.matcher(remaining);
            Matcher fileMatcher = FILE_PATTERN.matcher(remaining);

            int linkIdx = linkMatcher.find() ? linkMatcher.start() : Integer.MAX_VALUE;
            int urlIdx = urlMatcher.find() ? urlMatcher.start() : Integer.MAX_VALUE;
            int fileIdx = fileMatcher.find() ? fileMatcher.start() : Integer.MAX_VALUE;

            int minIdx = Math.min(linkIdx, Math.min(urlIdx, fileIdx));

            if (minIdx == Integer.MAX_VALUE) {
                result = result.append(Component.text(remaining));
                break;
            }

            if (minIdx > 0) {
                result = result.append(Component.text(remaining.substring(0, minIdx)));
                remaining = remaining.substring(minIdx);
            }

            if (minIdx == linkIdx) {
                linkMatcher.reset(remaining);
                if (linkMatcher.find()) {
                    String text = linkMatcher.group(1);
                    String url = linkMatcher.group(2);
                    String linkRaw = LangUtils.getRawLang("ticket.comment_link",
                            Map.of("{text}", text, "{url}", url));
                    result = result.append(MiniMessage.miniMessage().deserialize(linkRaw));
                    remaining = remaining.substring(linkMatcher.end());
                }
            } else if (minIdx == fileIdx) {
                fileMatcher.reset(remaining);
                if (fileMatcher.find()) {
                    String filename = fileMatcher.group(1);
                    String fileRaw = LangUtils.getRawLang("ticket.comment_file",
                            Map.of("{filename}", filename));
                    result = result.append(MiniMessage.miniMessage().deserialize(fileRaw));
                    remaining = remaining.substring(fileMatcher.end());
                }
            } else {
                urlMatcher.reset(remaining);
                if (urlMatcher.find()) {
                    String url = urlMatcher.group(1);
                    String linkRaw = LangUtils.getRawLang("ticket.comment_link",
                            Map.of("{text}", url, "{url}", url));
                    result = result.append(MiniMessage.miniMessage().deserialize(linkRaw));
                    remaining = remaining.substring(urlMatcher.end());
                }
            }
        }

        return result;
    }

    private void sendCommentPagination(Player player, int ticketId, int authorId, int currentPage, int totalPages) {
        Component prefixComp = LangUtils.prefixComponent();
        Component line = Component.empty();
        if (currentPage > 1) {
            String prevRaw = LangUtils.getRawLang("ticket.comments_prev");
            line = line.append(prefixComp.append(MiniMessage.miniMessage().deserialize(prevRaw))
                    .clickEvent(ClickEvent.runCommand("/lit ticket info " + ticketId + " " + (currentPage - 1)))
                    .hoverEvent(HoverEvent.showText(MiniMessage.miniMessage().deserialize(
                            LangUtils.getRawLang("ticket.comments_prev_hover")))));
        }
        String infoRaw = LangUtils.getRawLang("ticket.comments_page_info",
                Map.of("{page}", String.valueOf(currentPage), "{total}", String.valueOf(totalPages)));
        line = line.append(Component.text(" "))
                .append(MiniMessage.miniMessage().deserialize(infoRaw))
                .append(Component.text(" "));
        if (currentPage < totalPages) {
            String nextRaw = LangUtils.getRawLang("ticket.comments_next");
            line = line.append(prefixComp.append(MiniMessage.miniMessage().deserialize(nextRaw))
                    .clickEvent(ClickEvent.runCommand("/lit ticket info " + ticketId + " " + (currentPage + 1)))
                    .hoverEvent(HoverEvent.showText(MiniMessage.miniMessage().deserialize(
                            LangUtils.getRawLang("ticket.comments_next_hover")))));
        }
        player.sendMessage(line);
    }

    private void sendCommentAddButton(Player player, int ticketId) {
        Component prefixComp = LangUtils.prefixComponent();
        String addRaw = LangUtils.getRawLang("ticket.comment_add");
        Component addComp = prefixComp.append(MiniMessage.miniMessage().deserialize(addRaw))
                .clickEvent(ClickEvent.runCommand("/lit ticket comment " + ticketId))
                .hoverEvent(HoverEvent.showText(MiniMessage.miniMessage().deserialize(
                        LangUtils.getRawLang("ticket.comment_add_hover"))));
        player.sendMessage(addComp);
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
