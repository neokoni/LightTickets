package ink.neokoni.lightTickets.Commands.Functions;

import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.Configs.Datas.TemplateData;
import ink.neokoni.lightTickets.Configs.Datas.TemplateField;
import ink.neokoni.lightTickets.Configs.Datas.TicketSession;
import ink.neokoni.lightTickets.Configs.Templates;
import ink.neokoni.lightTickets.LightTickets;
import ink.neokoni.lightTickets.Utils.HttpUtils;
import ink.neokoni.lightTickets.Utils.JsonUtils;
import ink.neokoni.lightTickets.Utils.LangUtils;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.minimessage.MiniMessage;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class CreateTicket {
    private static final Map<UUID, TicketSession> sessions = new ConcurrentHashMap<>();

    public static TicketSession getSession(Player player) {
        return sessions.get(player.getUniqueId());
    }

    public static void removeSession(Player player) {
        sessions.remove(player.getUniqueId());
    }

    public CreateTicket(Player player) {
        showTemplatePicker(player);
    }

    public CreateTicket(Player player, String templateKey) {
        startSession(player, templateKey);
    }

    private void showTemplatePicker(Player player) {
        List<TemplateData> templates = Templates.getAllTemplates();
        if (templates.isEmpty()) {
            player.sendMessage(LangUtils.getLang("ticket.no_templates"));
            return;
        }
        player.sendMessage(LangUtils.getLang("ticket.select_template"));
        String hover = LangUtils.getRawLang("ticket.template_hover");
        Component prefixComp = LangUtils.prefixComponent();
        for (TemplateData t : templates) {
            String raw = LangUtils.getRawLang("ticket.template_item",
                    Map.of("{key}", t.getKey(),
                           "{hover}", hover,
                           "{name}", t.getName(),
                           "{description}", t.getDescription() != null ? t.getDescription() : ""));
            player.sendMessage(prefixComp.append(MiniMessage.miniMessage().deserialize(raw)));
        }
    }

    private void startSession(Player player, String templateKey) {
        TemplateData template = Templates.getTemplate(templateKey);
        if (template == null) {
            player.sendMessage(LangUtils.getLang("ticket.template_not_found",
                    Map.of("{type}", templateKey)));
            return;
        }

        if (sessions.containsKey(player.getUniqueId())) {
            removeSession(player);
        }

        String world = player.getWorld().getName();
        int x = player.getLocation().getBlockX();
        int y = player.getLocation().getBlockY();
        int z = player.getLocation().getBlockZ();
        String gameMode = player.getGameMode().name().toLowerCase();

        TicketSession session = new TicketSession(player, template, world, x, y, z, gameMode);
        sessions.put(player.getUniqueId(), session);

        player.sendMessage(LangUtils.getLang("ticket.session_started",
                Map.of("{template}", template.getName())));
        player.sendMessage(LangUtils.getLang("ticket.cancel_hint"));
        promptTitle(player);
    }

    public static void promptTitle(Player player) {
        player.sendMessage(LangUtils.getLang("ticket.title_prompt"));
    }

    public static void promptNext(Player player, TicketSession session) {
        if (session.isFinished()) {
            submitTicket(player, session);
            return;
        }

        if (session.isInfoStep()) {
            player.sendMessage(LangUtils.getLang("ticket.attach_info_prompt"));
            return;
        }

        TemplateField field = session.currentField();
        if (field == null) {
            submitTicket(player, session);
            return;
        }

        if ("markdown".equals(field.getType())) {
            if (field.getValue() != null && !field.getValue().isEmpty()) {
                player.sendMessage(LangUtils.getLang("ticket.markdown",
                        Map.of("{content}", field.getValue())));
            }
            session.setStep(session.getStep() + 1);
            promptNext(player, session);
            return;
        }

        promptField(player, field);
    }

    private static void promptField(Player player, TemplateField field) {
        String label = field.getLabel() != null ? field.getLabel() : field.getId();
        Map<String, String> placeholders = Map.of("{field}", label);

        if (field.isInputType()) {
            if (field.getPlaceholder() != null && !field.getPlaceholder().isEmpty()) {
                player.sendMessage(LangUtils.getLang("ticket.field_input_placeholder",
                        Map.of("{field}", label, "{placeholder}", field.getPlaceholder())));
            } else {
                player.sendMessage(LangUtils.getLang("ticket.field_input", placeholders));
            }
        } else if (field.isSelectType()) {
            player.sendMessage(LangUtils.getLang("ticket.field_single_select", placeholders));
            List<String> options = field.getOptions();
            for (int i = 0; i < options.size(); i++) {
                player.sendMessage(LangUtils.getLang("ticket.option",
                        Map.of("{num}", String.valueOf(i + 1), "{option}", options.get(i))));
            }
        } else if (field.isMultiSelectType()) {
            player.sendMessage(LangUtils.getLang("ticket.field_multi_select", placeholders));
            List<String> options = field.getOptions();
            for (int i = 0; i < options.size(); i++) {
                player.sendMessage(LangUtils.getLang("ticket.option",
                        Map.of("{num}", String.valueOf(i + 1), "{option}", options.get(i))));
            }
        }
    }

    public static void submitTicket(Player player, TicketSession session) {
        sessions.remove(player.getUniqueId());

        Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(), task -> {
            try {
                doSubmit(player, session);
            } catch (Throwable t) {
                LightTickets.getInstance().getLogger().log(java.util.logging.Level.SEVERE,
                        "Error while submitting ticket for " + player.getName(), t);
                player.sendMessage(LangUtils.getLang("errors.api_failed",
                        Map.of("{message}", t.getClass().getSimpleName() + ": "
                                + (t.getMessage() == null ? LangUtils.getRawLang("errors.no_message") : t.getMessage()))));
            }
        });
    }

    private static void doSubmit(Player player, TicketSession session) {
        TemplateData template = session.getTemplate();
        String title = (template.getTitlePrefix() != null ? template.getTitlePrefix() : "")
                + session.getTitle();

        JsonObject formData = new JsonObject();
        for (Map.Entry<String, String> entry : session.getFormData().entrySet()) {
            formData.addProperty(entry.getKey(), entry.getValue());
        }

        String body = renderBody(template, session.getFormData());

        JsonObject reqBody = new JsonObject();
        reqBody.addProperty("minecraftUuid", player.getUniqueId().toString());
        reqBody.addProperty("title", title);
        reqBody.addProperty("body", body);
        reqBody.addProperty("template", template.getKey());
        reqBody.add("formData", formData);
        if (session.isIncludeContext()) {
            JsonObject context = new JsonObject();
            context.addProperty("world", session.getWorld());
            context.addProperty("x", session.getX());
            context.addProperty("y", session.getY());
            context.addProperty("z", session.getZ());
            context.addProperty("gameMode", session.getGameMode());
            reqBody.add("context", context);
        }

        Map<String, String> headers = Map.of(
                "Content-Type", "application/json",
                "X-Server-Key", Config.getConfig().getServerKey());

        String baseUrl = trimTrailingSlash(Config.getConfig().getBaseUrl());
        String resp;
        try {
            resp = HttpUtils.post(baseUrl + "/api/mc/tickets",
                    JsonUtils.toJson(reqBody), headers);
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
        if (parsed == null || !parsed.has("id")) {
            String msg = parsed != null && parsed.has("error") ? parsed.get("error").getAsString() : LangUtils.getRawLang("errors.invalid_response");
            player.sendMessage(LangUtils.getLang("errors.api_failed",
                    Map.of("{message}", msg)));
            return;
        }
        int id = parsed.get("id").getAsInt();
        String respTitle = parsed.has("title") ? parsed.get("title").getAsString() : title;

        player.sendMessage(LangUtils.getLang("ticket.created",
                Map.of("{id}", String.valueOf(id), "{title}", respTitle)));
    }

    private static String renderBody(TemplateData template, Map<String, String> formData) {
        StringBuilder sb = new StringBuilder();
        for (TemplateField field : template.getFields()) {
            if ("markdown".equals(field.getType())) {
                if (field.getValue() != null) sb.append(field.getValue());
            } else if ("checkboxes".equals(field.getType())) {
                if (field.getId() == null) continue;
                String checked = formData.getOrDefault(field.getId(), "");
                if (!checked.isEmpty()) {
                    for (String label : checked.split(",")) {
                        if (!label.trim().isEmpty()) {
                            if (sb.length() > 0) sb.append("\n\n---\n\n");
                            sb.append("- [x] ").append(label.trim());
                        }
                    }
                }
            } else {
                if (field.getId() == null) continue;
                String label = field.getLabel() != null ? field.getLabel() : field.getId();
                String value = formData.getOrDefault(field.getId(), "");
                if (sb.length() > 0) sb.append("\n\n---\n\n");
                if ("textarea".equals(field.getType())) {
                    sb.append("**").append(label).append(":**\n\n").append(value);
                } else {
                    sb.append("**").append(label).append(":** ").append(value);
                }
            }
        }
        return sb.length() > 0 ? sb.toString() : LangUtils.getRawLang("ticket.empty_body");
    }

    private static String trimTrailingSlash(String url) {
        if (url == null) return "";
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
