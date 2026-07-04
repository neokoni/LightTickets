package ink.neokoni.lightTickets.Utils;

import ink.neokoni.lightTickets.LightTickets;

import java.util.Map;

public final class LogUtils {
    private static final int MAX_MESSAGE_LENGTH = 240;

    private LogUtils() {
    }

    public static void info(String key) {
        LightTickets.getInstance().getLogger().info(LangUtils.getRawLang(key));
    }

    public static void info(String key, Map<String, String> placeholders) {
        LightTickets.getInstance().getLogger().info(LangUtils.getRawLang(key, placeholders));
    }

    public static void warning(String key) {
        LightTickets.getInstance().getLogger().warning(LangUtils.getRawLang(key));
    }

    public static void warning(String key, Map<String, String> placeholders) {
        LightTickets.getInstance().getLogger().warning(LangUtils.getRawLang(key, placeholders));
    }

    public static void severe(String key, Map<String, String> placeholders) {
        LightTickets.getInstance().getLogger().severe(LangUtils.getRawLang(key, placeholders));
    }

    public static String exceptionText(Throwable throwable) {
        if (throwable == null) return "";
        String message = throwable.getMessage();
        String text = throwable.getClass().getSimpleName()
                + (message == null || message.isBlank() ? "" : ": " + message);
        return compact(text);
    }

    public static String compact(String value) {
        if (value == null) return "";
        String compacted = value.replace('\n', ' ').replace('\r', ' ').trim();
        return compacted.length() <= MAX_MESSAGE_LENGTH ? compacted : compacted.substring(0, MAX_MESSAGE_LENGTH);
    }
}
