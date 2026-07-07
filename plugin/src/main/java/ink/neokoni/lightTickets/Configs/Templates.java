package ink.neokoni.lightTickets.Configs;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Datas.TemplateData;
import ink.neokoni.lightTickets.Configs.Datas.TemplateField;
import ink.neokoni.lightTickets.LightTickets;
import ink.neokoni.lightTickets.Utils.ApiClient;
import ink.neokoni.lightTickets.Utils.ApiEndpoint;
import ink.neokoni.lightTickets.Utils.JsonUtils;
import ink.neokoni.lightTickets.Utils.LogUtils;
import org.bukkit.Bukkit;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

public class Templates {
    private static Map<String, TemplateData> cachedTemplates;
    private static Map<String, String> cachedRawJson;

    public static void init() {
        cachedTemplates = new ConcurrentHashMap<>();
        cachedRawJson = new ConcurrentHashMap<>();
        fetchAsync();
    }

    public static void reload() {
        fetchAsync();
    }

    public static void startRefreshTask() {
        int intervalMinutes = Config.getConfig().getTemplateRefreshInterval();
        if (intervalMinutes <= 0) return;
        Bukkit.getAsyncScheduler().runAtFixedRate(LightTickets.getInstance(),
                task -> doFetch(),
                intervalMinutes, intervalMinutes, TimeUnit.MINUTES);
    }

    public static void fetchAsync() {
        Bukkit.getAsyncScheduler().runNow(LightTickets.getInstance(), task -> doFetch());
    }

    public static TemplateData getTemplate(String key) {
        return cachedTemplates.get(key);
    }

    public static List<TemplateData> getAllTemplates() {
        return new ArrayList<>(cachedTemplates.values());
    }

    private static void doFetch() {
        try {
            String listResp = ApiClient.get(ApiEndpoint.TEMPLATES);
            if (listResp == null || listResp.isEmpty()) return;

            JsonArray list = JsonUtils.fromJson(listResp, JsonArray.class);
            if (list == null) return;

            Map<String, TemplateData> newTemplates = new ConcurrentHashMap<>();
            Map<String, String> newJsonMap = new ConcurrentHashMap<>();
            boolean changed = false;

            for (JsonElement el : list) {
                JsonObject summary = el.getAsJsonObject();
                String key = summary.get("name").getAsString();

                String detailResp = ApiClient.get(ApiEndpoint.TEMPLATE_DETAIL, Map.of("name", key));
                if (detailResp == null || detailResp.isEmpty()) continue;

                String cachedJson = cachedRawJson.get(key);
                if (cachedJson != null && cachedJson.equals(detailResp)
                        && cachedTemplates.containsKey(key)) {
                    newTemplates.put(key, cachedTemplates.get(key));
                    newJsonMap.put(key, cachedJson);
                } else {
                    TemplateData data = parseTemplate(key, detailResp);
                    if (data != null) {
                        newTemplates.put(key, data);
                        newJsonMap.put(key, detailResp);
                        changed = true;
                    }
                }
            }

            if (changed || newTemplates.size() != cachedTemplates.size()) {
                cachedTemplates = newTemplates;
                cachedRawJson = newJsonMap;
                LogUtils.info("templates.loaded",
                        Map.of("{count}", String.valueOf(cachedTemplates.size())));
            }
        } catch (Exception e) {
            LogUtils.warning("templates.fetch_failed",
                    Map.of("{message}", LogUtils.exceptionText(e)));
        }
    }

    private static TemplateData parseTemplate(String key, String json) {
        try {
            JsonObject obj = JsonUtils.fromJson(json, JsonObject.class);
            if (obj == null) return null;
            String name = obj.has("name") ? obj.get("name").getAsString() : key;
            String description = obj.has("description") ? obj.get("description").getAsString() : "";
            String titlePrefix = obj.has("title_prefix") && !obj.get("title_prefix").isJsonNull()
                    ? obj.get("title_prefix").getAsString() : "";

            List<String> labels = new ArrayList<>();
            if (obj.has("labels") && obj.get("labels").isJsonArray()) {
                for (JsonElement lbl : obj.getAsJsonArray("labels")) {
                    labels.add(lbl.getAsString());
                }
            }

            List<TemplateField> fields = new ArrayList<>();
            if (obj.has("body") && obj.get("body").isJsonArray()) {
                for (JsonElement fel : obj.getAsJsonArray("body")) {
                    TemplateField field = parseField(fel.getAsJsonObject());
                    if (field != null) fields.add(field);
                }
            }

            return new TemplateData(key, name, description, titlePrefix, labels, fields);
        } catch (Exception e) {
            LogUtils.warning("templates.parse_failed",
                    Map.of("{key}", key, "{message}", LogUtils.exceptionText(e)));
            return null;
        }
    }

    private static TemplateField parseField(JsonObject obj) {
        String type = obj.has("type") ? obj.get("type").getAsString() : "markdown";
        String id = obj.has("id") && !obj.get("id").isJsonNull() ? obj.get("id").getAsString() : null;

        boolean required = false;
        if (obj.has("validations") && obj.get("validations").isJsonObject()) {
            JsonObject val = obj.getAsJsonObject("validations");
            if (val.has("required")) required = val.get("required").getAsBoolean();
        }

        JsonObject attrs = obj.has("attributes") && obj.get("attributes").isJsonObject()
                ? obj.getAsJsonObject("attributes") : new JsonObject();

        String label = attrs.has("label") && !attrs.get("label").isJsonNull()
                ? attrs.get("label").getAsString() : "";
        String description = attrs.has("description") && !attrs.get("description").isJsonNull()
                ? attrs.get("description").getAsString() : "";
        String placeholder = attrs.has("placeholder") && !attrs.get("placeholder").isJsonNull()
                ? attrs.get("placeholder").getAsString() : "";
        String value = attrs.has("value") && !attrs.get("value").isJsonNull()
                ? attrs.get("value").getAsString() : "";

        List<String> options = new ArrayList<>();
        if (attrs.has("options") && attrs.get("options").isJsonArray()) {
            for (JsonElement opt : attrs.getAsJsonArray("options")) {
                if (opt.isJsonPrimitive()) {
                    options.add(opt.getAsString());
                } else if (opt.isJsonObject()) {
                    JsonObject optObj = opt.getAsJsonObject();
                    if (optObj.has("label")) options.add(optObj.get("label").getAsString());
                }
            }
        }

        return new TemplateField(type, id, required, label, description, placeholder, value, options);
    }

}
