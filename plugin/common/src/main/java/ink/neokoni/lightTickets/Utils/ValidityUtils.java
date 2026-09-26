package ink.neokoni.lightTickets.Utils;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Map;

public final class ValidityUtils {
    private ValidityUtils() {
    }

    public static String formatRemaining(String expiresAt) {
        try {
            long remainingMillis = Instant.parse(expiresAt).toEpochMilli() - System.currentTimeMillis();
            long minutes = Math.max(1, (long) Math.ceil(remainingMillis / 60_000.0));
            return LangUtils.getRawLang("bind.validity", Map.of("{minutes}", String.valueOf(minutes)));
        } catch (DateTimeParseException | NullPointerException e) {
            return expiresAt == null ? "" : expiresAt;
        }
    }
}
