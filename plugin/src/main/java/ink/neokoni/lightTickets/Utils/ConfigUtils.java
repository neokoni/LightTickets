package ink.neokoni.lightTickets.Utils;

import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.Configs.Language;
import ink.neokoni.lightTickets.Configs.PlayerData;
import ink.neokoni.lightTickets.LightTickets;

import java.io.File;
import java.nio.file.Path;

public class ConfigUtils {
    private static final Path dataPath = LightTickets.getInstance().getDataPath();

    public static Path getFilePath(String path) {
        return new File(dataPath.resolve(path).toUri()).toPath();
    }

    public static File getFile(String path) {
        return new File(getFilePath(path).toUri());
    }

    public static boolean isFileExist(Path path) {
        return path.toFile().exists();
    }

    public static boolean isFileExist(String path) {
        return dataPath.resolve(path).toFile().exists();
    }

    public static void loadAllConfigs() {
        Config.init();
        Language.init();
        PlayerData.init();
    }
}