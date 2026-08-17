package ink.neokoni.lightTickets.platform;

public final class LightPlatformProvider {
    private static volatile LightPlatform platform;

    private LightPlatformProvider() {
    }

    public static void set(LightPlatform instance) {
        platform = instance;
    }

    public static LightPlatform get() {
        LightPlatform instance = platform;
        if (instance == null) {
            throw new IllegalStateException("LightPlatform 尚未初始化");
        }
        return instance;
    }

    public static boolean isSet() {
        return platform != null;
    }
}
