package ink.neokoni.lightTickets.Configs;

import ink.neokoni.lightTickets.Utils.ConfigUtils;
import ink.neokoni.lightTickets.Utils.LogUtils;
import ink.neokoni.lightTickets.platform.LightPlatformProvider;
import org.yaml.snakeyaml.Yaml;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

public class Language {
    private static final String LANG_NAME = "lang.yml";
    private static Map<String, String> langValues = Map.of();

    public static void init() {
        if (!ConfigUtils.isFileExist(LANG_NAME)) {
            LightPlatformProvider.get().saveResource(LANG_NAME);
        }
        load();
    }

    public static void load() {
        Map<String, Object> defaults;
        try (InputStream in = Language.class.getResourceAsStream("/" + LANG_NAME)) {
            if (in == null) {
                throw new IllegalStateException("classpath resource /" + LANG_NAME + " missing");
            }
            defaults = parse(in);
        } catch (Throwable e) {
            LogUtils.warning("language.load_failed",
                    Map.of("{message}", LogUtils.exceptionText(e)));
            langValues = Map.of();
            return;
        }

        Map<String, Object> merged = defaults;
        try {
            Path userFile = ConfigUtils.getFilePath(LANG_NAME);
            Map<String, Object> user = ConfigUtils.isFileExist(userFile) ? parse(userFile.toFile()) : Map.of();
            merged = deepMerge(defaults, user);
        } catch (Throwable e) {
            LogUtils.warning("language.load_failed",
                    Map.of("{message}", LogUtils.exceptionText(e)));
            merged = defaults;
        }

        langValues = Map.copyOf(flatten(merged));
    }

    public static void reload() {
        if (!ConfigUtils.isFileExist(LANG_NAME)) {
            LightPlatformProvider.get().saveResource(LANG_NAME);
        }
        load();
    }

    /** 缺失返回 null, 与原有 getString 语义一致。 */
    public static String getString(String key) {
        return langValues.get(key);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> parse(Object source) {
        Yaml yaml = new Yaml();
        Object loaded = source instanceof InputStream in
                ? yaml.load(new InputStreamReader(in, StandardCharsets.UTF_8))
                : yaml.load(source.toString());
        return loaded instanceof Map<?, ?> map ? (Map<String, Object>) map : new LinkedHashMap<>();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> deepMerge(Map<String, Object> defaults, Map<String, Object> user) {
        Map<String, Object> merged = new LinkedHashMap<>(defaults);
        for (Map.Entry<String, Object> entry : user.entrySet()) {
            Object userValue = entry.getValue();
            Object defaultValue = merged.get(entry.getKey());
            if (userValue instanceof Map<?, ?> userMap && defaultValue instanceof Map<?, ?> defaultMap) {
                merged.put(entry.getKey(), deepMerge(
                        (Map<String, Object>) defaultMap, (Map<String, Object>) userMap));
            } else if (userValue != null) {
                merged.put(entry.getKey(), userValue);
            }
        }
        return merged;
    }

    private static Map<String, String> flatten(Map<String, Object> map) {
        Map<String, String> result = new LinkedHashMap<>();
        flattenInto("", map, result);
        return result;
    }

    @SuppressWarnings("unchecked")
    private static void flattenInto(String prefix, Map<String, Object> map, Map<String, String> out) {
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            String key = prefix.isEmpty() ? entry.getKey() : prefix + "." + entry.getKey();
            Object value = entry.getValue();
            if (value instanceof Map<?, ?> nested) {
                flattenInto(key, (Map<String, Object>) nested, out);
            } else if (value != null) {
                out.put(key, value.toString());
            }
        }
    }
}
