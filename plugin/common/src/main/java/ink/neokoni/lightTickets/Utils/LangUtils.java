package ink.neokoni.lightTickets.Utils;

import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.Configs.Language;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.minimessage.MiniMessage;
import net.kyori.adventure.text.minimessage.tag.resolver.Placeholder;
import net.kyori.adventure.text.minimessage.tag.resolver.TagResolver;

import java.util.Map;

public class LangUtils {
    public static Component getLang(String key) {
        return prefixComponent().append(getLangContent(key));
    }

    @SafeVarargs
    public static Component getLang(String key, Map<String, String>... placeholdersSet) {
        return prefixComponent().append(getLangContent(key, placeholdersSet));
    }

    public static Component getLang(String key, Map<String, String> textPlaceholders,
                                    Map<String, Component> componentPlaceholders) {
        return prefixComponent().append(getLangContent(key, textPlaceholders, componentPlaceholders));
    }

    public static Component getLangContent(String key) {
        String content = Language.getString(key);
        if (content == null) {
            return Component.empty();
        }
        return MiniMessage.miniMessage().deserialize(content);
    }

    @SafeVarargs
    public static Component getLangContent(String key, Map<String, String>... placeholdersSet) {
        String content = Language.getString(key);
        if (content == null) {
            return Component.empty();
        }

        return renderMiniMessage(content, placeholdersSet);
    }

    @SafeVarargs
    public static Component renderMiniMessage(String content, Map<String, String>... placeholdersSet) {
        if (content == null || content.isEmpty()) {
            return Component.empty();
        }

        TagResolver.Builder resolvers = TagResolver.builder();
        int index = 0;
        for (Map<String, String> placeholders : placeholdersSet) {
            for (Map.Entry<String, String> entry : placeholders.entrySet()) {
                String tag = "lt_text_" + index++;
                content = content.replace(entry.getKey(), '<' + tag + '>');
                resolvers.resolver(Placeholder.unparsed(tag, entry.getValue()));
            }
        }
        return MiniMessage.miniMessage().deserialize(content, resolvers.build());
    }

    public static Component getLangContent(String key, Map<String, String> textPlaceholders,
                                           Map<String, Component> componentPlaceholders) {
        String content = Language.getString(key);
        if (content == null) {
            return Component.empty();
        }

        TagResolver.Builder resolvers = TagResolver.builder();
        int index = 0;
        for (Map.Entry<String, String> entry : textPlaceholders.entrySet()) {
            String tag = "lt_text_" + index++;
            content = content.replace(entry.getKey(), '<' + tag + '>');
            resolvers.resolver(Placeholder.unparsed(tag, entry.getValue()));
        }
        for (Map.Entry<String, Component> entry : componentPlaceholders.entrySet()) {
            String tag = "lt_component_" + index++;
            content = content.replace(entry.getKey(), '<' + tag + '>');
            resolvers.resolver(Placeholder.component(tag, entry.getValue()));
        }
        return MiniMessage.miniMessage().deserialize(content, resolvers.build());
    }

    /**
     * Returns plain text for logs, exceptions, and other non-MiniMessage consumers.
     * Never pass the returned value to MiniMessage.deserialize; use getLangContent instead.
     */
    @SafeVarargs
    public static String getRawLang(String key, Map<String, String>... placeholdersSet) {
        String content = Language.getString(key);
        if (content == null) {
            return "";
        }
        String replaced = content;
        for (Map<String, String> placeholders : placeholdersSet) {
            for (Map.Entry<String, String> entry : placeholders.entrySet()) {
                replaced = replaced.replace(entry.getKey(), entry.getValue());
            }
        }
        return replaced;
    }

    public static String prefix() {
        try {
            return Config.getConfig().getPrefix();
        } catch (Throwable ignored) {
            return "";
        }
    }

    public static Component prefixComponent() {
        String p = prefix();
        return p.isEmpty() ? Component.empty() : MiniMessage.miniMessage().deserialize(p);
    }
}
