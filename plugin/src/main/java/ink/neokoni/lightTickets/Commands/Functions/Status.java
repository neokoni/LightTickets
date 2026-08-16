package ink.neokoni.lightTickets.Commands.Functions;

import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.LightTickets;
import ink.neokoni.lightTickets.Utils.ApiClient;
import ink.neokoni.lightTickets.Utils.ApiEndpoint;
import ink.neokoni.lightTickets.Utils.HttpUtils;
import ink.neokoni.lightTickets.Utils.JsonUtils;
import ink.neokoni.lightTickets.Utils.LangUtils;
import ink.neokoni.lightTickets.Utils.WebSocketClient;
import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.command.CommandSender;

import java.util.Map;

public class Status {
    public Status(CommandSender sender) {
        sender.sendMessage(LangUtils.getLang("status.header"));
        sender.sendMessage(LangUtils.getLang("status.websocket",
                Map.of(), Map.of("{status}", stateComponent(WebSocketClient.isConnected()))));

        Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(), task -> checkHttpApi(sender));
    }

    private static Component stateComponent(boolean online) {
        return LangUtils.getLangContent(online ? "status.online" : "status.offline");
    }

    private static void checkHttpApi(CommandSender sender) {
        HttpUtils.Resp resp;
        try {
            resp = ApiClient.requestWithStatus(ApiEndpoint.HEALTH);
        } catch (RuntimeException e) {
            sender.sendMessage(LangUtils.getLang("status.http_api",
                    Map.of(), Map.of("{status}", stateComponent(false))));
            sender.sendMessage(LangUtils.getLang("status.check_error",
                    Map.of("{message}", e.getMessage() == null
                            ? LangUtils.getRawLang("errors.unknown") : e.getMessage())));
            return;
        }

        boolean online = resp != null && resp.status() == 200
                && "ok".equalsIgnoreCase(healthStatus(resp.body()));
        sender.sendMessage(LangUtils.getLang("status.http_api",
                Map.of(), Map.of("{status}", stateComponent(online))));
    }

    private static String healthStatus(String body) {
        if (body == null || body.isBlank()) return "";
        try {
            JsonObject parsed = JsonUtils.fromJson(body, JsonObject.class);
            if (parsed == null || !parsed.has("status") || parsed.get("status").isJsonNull()) return "";
            return parsed.get("status").getAsString();
        } catch (RuntimeException ignored) {
            return "";
        }
    }
}
