package ink.neokoni.lightTickets.Utils;

import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.Configs.Language;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.minimessage.MiniMessage;
import org.bukkit.configuration.file.YamlConfiguration;

import java.util.Map;

public class LangUtils {
    public static Component getLang(String key) {
        String content = Language.getDefaultLang().getString(key);
        if (content == null) {
            return Component.empty();
        }
        return MiniMessage.miniMessage().deserialize(prefix() + content);
    }

    @SafeVarargs
    public static Component getLang(String key, Map<String, String>... placeholdersSet) {
        String content = Language.getDefaultLang().getString(key);
        if (content == null) {
            return Component.empty();
        }
        String replaced = content;
        for (Map<String, String> placeholders : placeholdersSet) {
            for (Map.Entry<String, String> entry : placeholders.entrySet()) {
                replaced = replaced.replace(entry.getKey(), entry.getValue());
            }
        }
        return MiniMessage.miniMessage().deserialize(prefix() + replaced);
    }

    public static YamlConfiguration getYaml() {
        return Language.getDefaultLang();
    }

    @SafeVarargs
    public static String getRawLang(String key, Map<String, String>... placeholdersSet) {
        String content = Language.getDefaultLang().getString(key);
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
}