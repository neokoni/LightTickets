package ink.neokoni.lightTickets.Commands.Functions;

import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.Configs.Datas.CommentSession;
import ink.neokoni.lightTickets.LightTickets;
import ink.neokoni.lightTickets.Utils.HttpUtils;
import ink.neokoni.lightTickets.Utils.JsonUtils;
import ink.neokoni.lightTickets.Utils.LangUtils;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class AddComment {
    private static final Map<UUID, CommentSession> sessions = new ConcurrentHashMap<>();

    public static CommentSession getSession(Player player) {
        return sessions.get(player.getUniqueId());
    }

    public static void removeSession(Player player) {
        sessions.remove(player.getUniqueId());
    }

    public AddComment(Player player, int ticketId) {
        startSession(player, ticketId, null, null);
    }

    public AddComment(Player player, int ticketId, String replyToAuthor, String replyToBody) {
        startSession(player, ticketId, replyToAuthor, replyToBody);
    }

    private void startSession(Player player, int ticketId, String replyToAuthor, String replyToBody) {
        if (sessions.containsKey(player.getUniqueId())) {
            removeSession(player);
        }

        CommentSession session;
        if (replyToBody != null && !replyToBody.isEmpty()) {
            session = new CommentSession(ticketId, replyToAuthor, replyToBody);
            player.sendMessage(LangUtils.getLang("ticket.reply_prompt",
                    Map.of("{author}", replyToAuthor != null ? replyToAuthor : "")));
        } else {
            session = new CommentSession(ticketId);
            player.sendMessage(LangUtils.getLang("ticket.comment_send_prompt"));
        }
        player.sendMessage(LangUtils.getLang("ticket.cancel_hint"));
        sessions.put(player.getUniqueId(), session);
    }

    public static void submitComment(Player player, CommentSession session, String input) {
        sessions.remove(player.getUniqueId());

        String body;
        if (session.isReply()) {
            String quoted = quoteLines(session.getReplyToBody());
            body = "> " + quoted + "\n\n" + input;
        } else {
            body = input;
        }

        Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(), task -> {
            try {
                doSubmit(player, session.getTicketId(), body);
            } catch (Throwable t) {
                LightTickets.getInstance().getLogger().log(java.util.logging.Level.SEVERE,
                        "Error while submitting comment for " + player.getName(), t);
                player.sendMessage(LangUtils.getLang("ticket.comment_send_failed",
                        Map.of("{message}", t.getClass().getSimpleName() + ": "
                                + (t.getMessage() == null ? LangUtils.getRawLang("errors.no_message") : t.getMessage()))));
            }
        });
    }

    private static void doSubmit(Player player, int ticketId, String body) {
        String baseUrl = trimTrailingSlash(Config.getConfig().getBaseUrl());
        String url = baseUrl + "/api/mc/comments";

        JsonObject reqBody = new JsonObject();
        reqBody.addProperty("minecraftUuid", player.getUniqueId().toString());
        reqBody.addProperty("ticketId", ticketId);
        reqBody.addProperty("body", body);

        Map<String, String> headers = Map.of(
                "Content-Type", "application/json",
                "X-Server-Key", Config.getConfig().getServerKey());

        String resp;
        try {
            resp = HttpUtils.post(url, JsonUtils.toJson(reqBody), headers);
        } catch (RuntimeException e) {
            player.sendMessage(LangUtils.getLang("ticket.comment_send_failed",
                    Map.of("{message}", e.getMessage() == null ? LangUtils.getRawLang("errors.unknown") : e.getMessage())));
            return;
        }
        if (resp == null || resp.isEmpty()) {
            player.sendMessage(LangUtils.getLang("ticket.comment_send_failed",
                    Map.of("{message}", LangUtils.getRawLang("errors.empty_response"))));
            return;
        }

        JsonObject parsed = JsonUtils.fromJson(resp, JsonObject.class);
        if (parsed == null || !parsed.has("id")) {
            String msg = parsed != null && parsed.has("error") ? parsed.get("error").getAsString() : LangUtils.getRawLang("errors.invalid_response");
            player.sendMessage(LangUtils.getLang("ticket.comment_send_failed",
                    Map.of("{message}", msg)));
            return;
        }

        player.sendMessage(LangUtils.getLang("ticket.comment_send_success"));
    }

    private static String quoteLines(String text) {
        if (text == null) return "";
        String[] lines = text.split("\n", -1);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < lines.length; i++) {
            if (i > 0) sb.append("\n> ");
            sb.append(lines[i]);
        }
        return sb.toString();
    }

    private static String trimTrailingSlash(String url) {
        if (url == null) return "";
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
