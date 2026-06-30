package ink.neokoni.lightTickets.Configs;

import ink.neokoni.lightTickets.LightTickets;
import ink.neokoni.lightTickets.Utils.ConfigUtils;
import lombok.Getter;
import org.bukkit.configuration.file.YamlConfiguration;

import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Objects;

public class Language {
    private static Path defaultLangFile;
    @Getter
    private static YamlConfiguration defaultLang;

    public static void init() {
        String langName = "lang.yml";
        defaultLangFile = ConfigUtils.getFilePath(langName);
        if (!ConfigUtils.isFileExist(defaultLangFile)) {
            LightTickets.getInstance().saveResource(langName, false);
        }
        YamlConfiguration user = YamlConfiguration.loadConfiguration(defaultLangFile.toFile());
        YamlConfiguration defaults = YamlConfiguration.loadConfiguration(
                new InputStreamReader(
                        Objects.requireNonNull(LightTickets.getInstance().getResource(langName)),
                        StandardCharsets.UTF_8));
        user.setDefaults(defaults);
        defaultLang = user;
    }
}