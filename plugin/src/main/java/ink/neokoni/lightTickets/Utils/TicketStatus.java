package ink.neokoni.lightTickets.Utils;

import ink.neokoni.lightTickets.Configs.Config;
import net.kyori.adventure.text.format.TextColor;

import java.util.Arrays;

public enum TicketStatus {
    OPEN("open"),
    IN_PROGRESS("in_progress"),
    CLOSED("closed"),
    INVALID("invalid"),
    UNKNOWN("");

    private final String key;

    TicketStatus(String key) {
        this.key = key;
    }

    public String key() {
        return key;
    }

    public boolean isKnown() {
        return this != UNKNOWN;
    }

    public boolean isPlayerSelectable() {
        return this == OPEN || this == CLOSED;
    }

    public boolean canPlayerTransitionFrom(TicketStatus current) {
        if (current == INVALID) return false;
        if (this == OPEN) return current == CLOSED;
        if (this == CLOSED) return current == OPEN || current == IN_PROGRESS;
        return false;
    }

    public String label() {
        String label = LangUtils.getRawLang("ticket.status_" + key);
        if (label.isEmpty()) {
            return isKnown() ? key : LangUtils.getRawLang("ticket.status_open");
        }
        return label;
    }

    public String color() {
        Config.TicketStatusColors colors = Config.getConfig().getTicketStatusColors();
        if (colors == null) return "";
        return switch (this) {
            case OPEN -> colors.getOpen();
            case IN_PROGRESS -> colors.getInProgress();
            case CLOSED -> colors.getClosed();
            case INVALID -> colors.getInvalid();
            case UNKNOWN -> colors.getUnknown();
        };
    }

    public TextColor textColor() {
        TextColor color = TextColor.fromHexString(color());
        return color != null ? color : TextColor.color(255, 255, 255);
    }

    public static TicketStatus fromKey(String key) {
        return Arrays.stream(values())
                .filter(status -> status.key.equals(key))
                .findFirst()
                .orElse(UNKNOWN);
    }

    public static TicketStatus[] selectableByStaff() {
        return new TicketStatus[]{OPEN, IN_PROGRESS, CLOSED, INVALID};
    }

    public static TicketStatus[] selectableByPlayer() {
        return new TicketStatus[]{OPEN, CLOSED};
    }
}
