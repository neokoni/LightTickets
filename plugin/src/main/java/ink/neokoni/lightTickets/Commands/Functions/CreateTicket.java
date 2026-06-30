package ink.neokoni.lightTickets.Commands.Functions;

import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.LightTickets;
import ink.neokoni.lightTickets.Utils.HttpUtils;
import ink.neokoni.lightTickets.Utils.JsonUtils;
import ink.neokoni.lightTickets.Utils.LangUtils;
import org.bukkit.entity.Player;

import java.util.Map;

public class CreateTicket {
    public CreateTicket(Player player, String title,
                        String world, int x, int y, int z, String gameMode) {
        try {
            run(player, title, world, x, y, z, gameMode);
        } catch (Throwable t) {
            LightTickets.getInstance().getLogger().log(java.util.logging.Level.SEVERE,
                    "Error while creating ticket for " + player.getName(), t);
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", t.getClass().getSimpleName() + ": "
                            + (t.getMessage() == null ? "no message" : t.getMessage()))));
        }
    }

    private void run(Player player, String title,
                     String world, int x, int y, int z, String gameMode) {
        if (title == null || title.isEmpty()) {
            player.sendMessage(LangUtils.getLang("ticket.title_prompt"));
            return;
        }

        String baseUrl = trimTrailingSlash(Config.getConfig().getBaseUrl());
        JsonObject context = new JsonObject();
        context.addProperty("world", world);
        context.addProperty("x", x);
        context.addProperty("y", y);
        context.addProperty("z", z);
        context.addProperty("gameMode", gameMode);

        JsonObject body = new JsonObject();
        body.addProperty("minecraftUuid", player.getUniqueId().toString());
        body.addProperty("title", title);
        body.addProperty("body", title);
        body.addProperty("template", "bug-report");
        body.add("formData", new JsonObject());
        body.add("context", context);

        Map<String, String> headers = Map.of(
                "Content-Type", "application/json",
                "X-Server-Key", Config.getConfig().getServerKey());

        String resp;
        try {
            resp = HttpUtils.post(baseUrl + "/api/mc/tickets",
                    JsonUtils.toJson(body), headers);
        } catch (RuntimeException e) {
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", e.getMessage() == null ? "unknown" : e.getMessage())));
            return;
        }
        if (resp == null || resp.isEmpty()) {
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", "empty response")));
            return;
        }

        JsonObject parsed = JsonUtils.fromJson(resp, JsonObject.class);
        if (parsed == null || !parsed.has("id")) {
            String msg = parsed != null && parsed.has("error") ? parsed.get("error").getAsString() : "invalid response";
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", msg)));
            return;
        }
        int id = parsed.get("id").getAsInt();
        String respTitle = parsed.has("title") ? parsed.get("title").getAsString() : title;

        player.sendMessage(LangUtils.getLang("ticket.created",
                Map.of("{id}", String.valueOf(id), "{title}", respTitle)));
    }

    private String trimTrailingSlash(String url) {
        if (url == null) return "";
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}