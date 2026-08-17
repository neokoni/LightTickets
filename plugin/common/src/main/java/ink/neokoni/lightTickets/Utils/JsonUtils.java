package ink.neokoni.lightTickets.Utils;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

public class JsonUtils {
    private static Gson gson;

    private static void initGson() {
        if (gson != null) return;
        GsonBuilder builder = new GsonBuilder();
        builder.enableComplexMapKeySerialization();
        gson = builder.create();
    }

    public static String toJson(Object obj) {
        initGson();
        return gson.toJson(obj);
    }

    public static <T> T fromJson(String json, Class<T> clazz) {
        initGson();
        return gson.fromJson(json, clazz);
    }
}