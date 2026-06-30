package ink.neokoni.lightTickets.Configs;

import de.exlll.configlib.Comment;
import de.exlll.configlib.Configuration;
import de.exlll.configlib.YamlConfigurationProperties;
import de.exlll.configlib.YamlConfigurations;
import ink.neokoni.lightTickets.Configs.Datas.StorageInfo;
import ink.neokoni.lightTickets.LightTickets;
import ink.neokoni.lightTickets.Utils.ConfigUtils;
import lombok.Getter;

import java.nio.file.Path;

@Configuration
public class Config {
    private static final String configName = "config.yml";
    private static Path configFile;
    @Getter
    private static BasicConfig config;

    @Configuration
    public static class BasicConfig {
        @Comment("LightTickets 平台 API 地址")
        @Getter
        private String baseUrl = "http://localhost:3000";
        @Comment("LightTickets 服务器密钥 (请求头 X-Server-Key)")
        @Getter
        private String serverKey = "";
        @Comment("插件消息前缀 (MiniMessage)")
        @Getter
        private String prefix = "<white>[<color:#96bfff>LTickets<white>] ";
        @Comment("数据存储设置")
        @Getter
        private StorageInfo storage = new StorageInfo(
                "SQLITE",
                "127.0.0.1",
                3306,
                "root",
                "",
                "lighttickets",
                ""
        );
    }

    public static void init() {
        config = new BasicConfig();
        configFile = ConfigUtils.getFilePath(configName);
        load();
    }

    public static void load() {
        if (!ConfigUtils.isFileExist(configFile)) {
            YamlConfigurations.save(configFile, BasicConfig.class, config);
        }
        YamlConfigurationProperties properties = YamlConfigurationProperties.newBuilder()
                .inputNulls(true)
                .outputNulls(true)
                .build();
        config = YamlConfigurations.update(configFile, BasicConfig.class, properties);
    }

    public static void reload() {
        if (configFile == null) {
            configFile = ConfigUtils.getFilePath(configName);
        }
        load();
    }
}