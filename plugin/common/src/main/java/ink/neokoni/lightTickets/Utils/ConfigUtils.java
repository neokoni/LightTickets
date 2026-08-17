package ink.neokoni.lightTickets.Utils;

import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.Configs.Language;
import ink.neokoni.lightTickets.Configs.PlayerData;
import ink.neokoni.lightTickets.Configs.Templates;
import ink.neokoni.lightTickets.platform.LightPlatformProvider;

import java.io.File;
import java.nio.file.Path;

public class ConfigUtils {
    public static Path getFilePath(String path) {
        return LightPlatformProvider.get().getDataPath().resolve(path);
    }

    public static File getFile(String path) {
        return getFilePath(path).toFile();
    }

    public static boolean isFileExist(Path path) {
        return path.toFile().exists();
    }

    public static boolean isFileExist(String path) {
        return getFilePath(path).toFile().exists();
    }

    public static void loadAllConfigs() {
        Config.init();
        Language.init();
        PlayerData.init();
        Templates.init();
    }

    public static void reloadAllConfigs() {
        Config.reload();
        Language.reload();
        PlayerData.reload();
        Templates.reload();
    }
}
