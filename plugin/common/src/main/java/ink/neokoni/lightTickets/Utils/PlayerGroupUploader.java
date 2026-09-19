package ink.neokoni.lightTickets.Utils;

import com.google.gson.JsonObject;
import ink.neokoni.lightTickets.Configs.Config;
import ink.neokoni.lightTickets.platform.LightPlatformProvider;
import ink.neokoni.lightTickets.platform.LightPlayer;

import java.util.Arrays;
import java.util.Map;

public final class PlayerGroupUploader {
    private PlayerGroupUploader() {}

    public static void upload(LightPlayer player) {
        String playerName = player.getName();
        Config.PlayerGroupUpload upload = Config.getConfig().getPlayerGroupUpload();
        if (!upload.isEnabled() || playerName == null || !playerName.matches("[A-Za-z0-9_]{3,16}")) return;
        Arrays.stream(upload.getGroupId() == null ? new String[0] : upload.getGroupId())
                .map(String::trim)
                .filter(groupId -> !groupId.isEmpty())
                .distinct()
                .forEach(groupId -> LightPlatformProvider.get().runAsync(() -> {
                    JsonObject body = new JsonObject();
                    body.addProperty("groupId", groupId);
                    body.addProperty("value", playerName);
                    try {
                        ApiClient.requestWithStatus(player, ApiEndpoint.MC_PLAYER_GROUP_ITEM, body.toString());
                    } catch (RuntimeException e) {
                        // Best effort, but surface failures so a misconfigured group or auth is debuggable.
                        LogUtils.warning("player_group.upload_failed",
                                Map.of("{group}", groupId, "{message}", LogUtils.exceptionText(e)));
                    }
                }));
    }
}
