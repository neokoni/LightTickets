package ink.neokoni.lightTickets.Commands;

import ink.neokoni.lightTickets.Commands.Functions.AddComment;
import ink.neokoni.lightTickets.Commands.Functions.CreateTicket;
import ink.neokoni.lightTickets.Configs.Datas.CommentSession;
import ink.neokoni.lightTickets.Configs.Datas.TemplateField;
import ink.neokoni.lightTickets.Configs.Datas.TicketSession;
import ink.neokoni.lightTickets.Utils.LangUtils;
import ink.neokoni.lightTickets.platform.LightPlayer;

import java.util.Map;
import java.util.Set;

public final class TicketInputProcessor {
    public static boolean process(LightPlayer player, String input) {
        CommentSession commentSession = AddComment.getSession(player);
        if (commentSession != null) {
            if (input.equalsIgnoreCase("cancel")) {
                AddComment.removeSession(player);
                player.sendMessage(LangUtils.getLang("ticket.comment_cancelled"));
                return true;
            }
            if (input.isEmpty()) {
                player.sendMessage(LangUtils.getLang("ticket.comment_empty"));
                return true;
            }
            AddComment.submitComment(player, commentSession, input);
            return true;
        }

        TicketSession session = CreateTicket.getSession(player);
        if (session == null) return false;

        if (input.equalsIgnoreCase("cancel")) {
            CreateTicket.removeSession(player);
            player.sendMessage(LangUtils.getLang("ticket.cancelled"));
            return true;
        }
        if (session.isTitleStep()) {
            handleTitleInput(player, session, input);
        } else {
            handleFieldInput(player, session, input);
        }
        return true;
    }

    private static void handleTitleInput(LightPlayer player, TicketSession session, String input) {
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

    private static void handleFieldInput(LightPlayer player, TicketSession session, String input) {
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

        if (field.isSelectInputType()) {
            if (field.isRequired() && input.isEmpty()) {
                player.sendMessage(LangUtils.getLang("ticket.field_required",
                        Map.of("{field}", field.getLabel())));
                return;
            }
            session.getFormData().put(field.getId(), normalizeSelectInput(field, input));
        } else if (field.isInputType()) {
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
            if (input.isEmpty()) {
                session.getFormData().put(field.getId(), "");
            } else {
                int idx = Integer.parseInt(input) - 1;
                session.getFormData().put(field.getId(), field.getOptions().get(idx).getLabel());
            }
        } else if (field.isMultiSelectType()) {
            String error = validateMultiSelect(field, input);
            if (error != null) {
                player.sendMessage(LangUtils.getLang("ticket.invalid_option",
                        Map.of("{message}", error)));
                return;
            }
            StringBuilder labels = new StringBuilder();
            if (!input.isEmpty()) {
                String[] parts = input.split("\\s+");
                for (String p : parts) {
                    int idx = Integer.parseInt(p) - 1;
                    if (labels.length() > 0) labels.append(",");
                    labels.append(field.getOptions().get(idx).getLabel());
                }
            }
            session.getFormData().put(field.getId(), labels.toString());
        }

        session.setStep(session.getStep() + 1);
        CreateTicket.promptNext(player, session);
    }

    private static void handleInfoInput(LightPlayer player, TicketSession session, String input) {
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

    private static void handleVisibilityInput(LightPlayer player, TicketSession session, String input) {
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

    private static String validateSingleSelect(TemplateField field, String input) {
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

    private static String normalizeSelectInput(TemplateField field, String input) {
        if (!input.isEmpty()) {
            try {
                int idx = Integer.parseInt(input);
                if (idx >= 1 && idx <= field.getOptions().size()) {
                    return field.getOptions().get(idx - 1).getLabel();
                }
            } catch (NumberFormatException ignored) {
                // Non-numeric values are valid custom input for select_input fields.
            }
        }
        return input;
    }

    private static String validateMultiSelect(TemplateField field, String input) {
        boolean hasRequiredOption = field.getOptions().stream().anyMatch(option -> option.isRequired());
        if (input.isEmpty() && (field.isRequired() || hasRequiredOption)) {
            return LangUtils.getRawLang("ticket.err_multi_required");
        }
        if (!input.isEmpty()) {
            String[] parts = input.split("\\s+");
            Set<Integer> selected = new java.util.HashSet<>();
            for (String p : parts) {
                try {
                    int idx = Integer.parseInt(p);
                    if (idx < 1 || idx > field.getOptions().size()) {
                        return LangUtils.getRawLang("ticket.err_range",
                                Map.of("{max}", String.valueOf(field.getOptions().size())));
                    }
                    selected.add(idx);
                } catch (NumberFormatException e) {
                    return LangUtils.getRawLang("ticket.err_multi_number");
                }
            }
            for (int i = 0; i < field.getOptions().size(); i++) {
                if (field.getOptions().get(i).isRequired() && !selected.contains(i + 1)) {
                    return LangUtils.getRawLang("ticket.err_multi_required");
                }
            }
        }
        return null;
    }
}
