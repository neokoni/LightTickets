package ink.neokoni.lightTickets.Utils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class TicketSearchParser {
    private static final Pattern FILTER_PATTERN = Pattern.compile(
            "([^\\s:]+):\\s*(?:\"((?:\\\\.|[^\"\\\\])*)\"|(\\S+))");

    private TicketSearchParser() {
    }

    public static SearchFilter parse(String rawQuery) {
        String normalized = rawQuery == null ? "" : rawQuery.trim();
        Map<String, String> params = new LinkedHashMap<>();
        List<String> textParts = new ArrayList<>();
        Matcher matcher = FILTER_PATTERN.matcher(normalized);
        int lastIndex = 0;

        while (matcher.find()) {
            addText(textParts, normalized.substring(lastIndex, matcher.start()));
            String quotedValue = matcher.group(2);
            String value = quotedValue == null ? matcher.group(3) : unescapeQuoted(quotedValue);
            if (!applyFilter(params, matcher.group(1), value, quotedValue != null)) {
                addText(textParts, matcher.group());
            }
            lastIndex = matcher.end();
        }
        addText(textParts, normalized.substring(lastIndex));

        String search = String.join(" ", textParts).trim();
        if (!search.isEmpty()) params.put("search", search);
        return new SearchFilter(normalized, Map.copyOf(params));
    }

    private static boolean applyFilter(Map<String, String> params, String rawKey, String value,
                                       boolean quoted) {
        if (!quoted && value.startsWith("\"")) return false;

        String key = rawKey.toLowerCase(Locale.ROOT);
        return switch (key) {
            case "author" -> {
                params.put("authorName", value);
                yield true;
            }
            case "type" -> {
                params.put("type", value);
                yield true;
            }
            case "status" -> applyStatusFilter(params, value);
            case "from" -> applySourceFilter(params, value);
            default -> false;
        };
    }

    private static boolean applyStatusFilter(Map<String, String> params, String value) {
        TicketStatus status = TicketStatus.fromKey(value.toLowerCase(Locale.ROOT));
        if (!status.isKnown()) return false;
        params.put("statuses", status.key());
        return true;
    }

    private static boolean applySourceFilter(Map<String, String> params, String value) {
        String normalized = value.toLowerCase(Locale.ROOT);
        if ("web".equals(normalized)) {
            params.remove("serverName");
            params.put("hasServer", "false");
            return true;
        }
        if ("minecraft".equals(normalized)) {
            params.remove("serverName");
            params.put("hasServer", "true");
            return true;
        }
        String prefix = "minecraft:";
        if (!normalized.startsWith(prefix) || value.length() <= prefix.length()) return false;
        params.remove("hasServer");
        params.put("serverName", value.substring(prefix.length()));
        return true;
    }

    private static String unescapeQuoted(String value) {
        StringBuilder result = new StringBuilder(value.length());
        boolean escaping = false;
        for (int i = 0; i < value.length(); i++) {
            char current = value.charAt(i);
            if (escaping) {
                result.append(current);
                escaping = false;
            } else if (current == '\\') {
                escaping = true;
            } else {
                result.append(current);
            }
        }
        if (escaping) result.append('\\');
        return result.toString();
    }

    private static void addText(List<String> parts, String value) {
        String trimmed = value.trim();
        if (!trimmed.isEmpty()) parts.add(trimmed);
    }

    public record SearchFilter(String rawQuery, Map<String, String> params) {
    }
}
