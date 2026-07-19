package ink.neokoni.lightTickets.Listeners;

import ink.neokoni.lightTickets.Commands.Functions.AddComment;
import ink.neokoni.lightTickets.Commands.Functions.CreateTicket;
import ink.neokoni.lightTickets.Configs.Datas.CommentSession;
import ink.neokoni.lightTickets.Configs.Datas.TemplateField;
import ink.neokoni.lightTickets.Configs.Datas.TicketSession;
import ink.neokoni.lightTickets.Utils.LangUtils;
import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerQuitEvent;

import java.util.Map;

public class TicketChatListener implements Listener {

    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onChat(AsyncChatEvent event) {
        Player player = event.getPlayer();

        CommentSession commentSession = AddComment.getSession(player);
        if (commentSession != null) {
            event.setCancelled(true);
            String input = PlainTextComponentSerializer.plainText().serialize(event.message()).trim();
            if (input.equalsIgnoreCase("cancel")) {
                AddComment.removeSession(player);
                player.sendMessage(LangUtils.getLang("ticket.comment_cancelled"));
                return;
            }
            if (input.isEmpty()) {
                player.sendMessage(LangUtils.getLang("ticket.comment_empty"));
                return;
            }
            AddComment.submitComment(player, commentSession, input);
            return;
        }

        TicketSession session = CreateTicket.getSession(player);
        if (session == null) return;

        event.setCancelled(true);
        String input = PlainTextComponentSerializer.plainText().serialize(event.message()).trim();

        if (input.equalsIgnoreCase("cancel")) {
            CreateTicket.removeSession(player);
            player.sendMessage(LangUtils.getLang("ticket.cancelled"));
            return;
        }

        if (session.isTitleStep()) {
            handleTitleInput(player, session, input);
        } else {
            handleFieldInput(player, session, input);
        }
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        CreateTicket.removeSession(event.getPlayer());
    }

    private void handleTitleInput(Player player, TicketSession session, String input) {
        if (input.isEmpty()) {
            player.sendMessage(LangUtils.getLang("ticket.title_required"));
            return;
        }
        if (input.length() > 200) {
            player.sendMessage(LangUtils.getLang("ticket.title_too_long"));
            return;
        }
        session.setTitle(input);
        session.setStep(1);
        CreateTicket.promptNext(player, session);
    }

    private void handleFieldInput(Player player, TicketSession session, String input) {
        if (session.isInfoStep()) {
            handleInfoInput(player, session, input);
            return;
        }
        if (session.isVisibilityStep()) {
            handleVisibilityInput(player, session, input);
            return;
        }

        TemplateField field = session.currentField();
        if (field == null) {
            CreateTicket.submitTicket(player, session);
            return;
        }

        if ("markdown".equals(field.getType())) {
            session.setStep(session.getStep() + 1);
            CreateTicket.promptNext(player, session);
            return;
        }

        if (field.isInputType()) {
            if (field.isRequired() && input.isEmpty()) {
                player.sendMessage(LangUtils.getLang("ticket.field_required",
                        Map.of("{field}", field.getLabel())));
                return;
            }
            session.getFormData().put(field.getId(), input);
        } else if (field.isSelectType()) {
            String error = validateSingleSelect(field, input);
            if (error != null) {
                player.sendMessage(LangUtils.getLang("ticket.invalid_option",
                        Map.of("{message}", error)));
                return;
            }
            int idx = Integer.parseInt(input) - 1;
            session.getFormData().put(field.getId(), field.getOptions().get(idx));
        } else if (field.isMultiSelectType()) {
            String error = validateMultiSelect(field, input);
            if (error != null) {
                player.sendMessage(LangUtils.getLang("ticket.invalid_option",
                        Map.of("{message}", error)));
                return;
            }
            String[] parts = input.split("\\s+");
            StringBuilder labels = new StringBuilder();
            for (String p : parts) {
                int idx = Integer.parseInt(p) - 1;
                if (labels.length() > 0) labels.append(",");
                labels.append(field.getOptions().get(idx));
            }
            session.getFormData().put(field.getId(), labels.toString());
        }

        session.setStep(session.getStep() + 1);
        CreateTicket.promptNext(player, session);
    }

    private void handleInfoInput(Player player, TicketSession session, String input) {
        String lower = input.toLowerCase();
        if (lower.equals("yes") || lower.equals("y")) {
            session.setIncludeContext(true);
        } else if (lower.equals("no") || lower.equals("n")) {
            session.setIncludeContext(false);
        } else {
            player.sendMessage(LangUtils.getLang("ticket.attach_info_invalid"));
            return;
        }
        session.setStep(session.getStep() + 1);
        CreateTicket.promptNext(player, session);
    }

    private void handleVisibilityInput(Player player, TicketSession session, String input) {
        String lower = input.toLowerCase();
        if (lower.equals("yes") || lower.equals("y")) {
            session.setHidden(true);
        } else if (lower.equals("no") || lower.equals("n")) {
            session.setHidden(false);
        } else {
            player.sendMessage(LangUtils.getLang("ticket.visibility_invalid"));
            return;
        }
        session.setStep(session.getStep() + 1);
        CreateTicket.promptNext(player, session);
    }

    private String validateSingleSelect(TemplateField field, String input) {
        if (field.isRequired() && input.isEmpty()) {
            return LangUtils.getRawLang("ticket.err_single_required");
        }
        if (!input.isEmpty()) {
            try {
                int idx = Integer.parseInt(input);
                if (idx < 1 || idx > field.getOptions().size()) {
                    return LangUtils.getRawLang("ticket.err_range",
                            Map.of("{max}", String.valueOf(field.getOptions().size())));
                }
            } catch (NumberFormatException e) {
                return LangUtils.getRawLang("ticket.err_single_number");
            }
        }
        return null;
    }

    private String validateMultiSelect(TemplateField field, String input) {
        if (field.isRequired() && input.isEmpty()) {
            return LangUtils.getRawLang("ticket.err_multi_required");
        }
        if (!input.isEmpty()) {
            String[] parts = input.split("\\s+");
            for (String p : parts) {
                try {
                    int idx = Integer.parseInt(p);
                    if (idx < 1 || idx > field.getOptions().size()) {
                        return LangUtils.getRawLang("ticket.err_range",
                                Map.of("{max}", String.valueOf(field.getOptions().size())));
                    }
                } catch (NumberFormatException e) {
                    return LangUtils.getRawLang("ticket.err_multi_number");
                }
            }
        }
        return null;
    }
}
