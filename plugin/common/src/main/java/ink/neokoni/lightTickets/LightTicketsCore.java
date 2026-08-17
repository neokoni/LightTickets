package ink.neokoni.lightTickets;

import ink.neokoni.lightTickets.Commands.Functions.AddComment;
import ink.neokoni.lightTickets.Commands.Functions.CreateTicket;
import ink.neokoni.lightTickets.Commands.Functions.TicketInfo;
import ink.neokoni.lightTickets.Configs.PlayerData;
import ink.neokoni.lightTickets.Configs.Templates;
import ink.neokoni.lightTickets.Utils.ConfigUtils;
import ink.neokoni.lightTickets.Utils.DataRefreshManager;
import ink.neokoni.lightTickets.Utils.WebSocketClient;
import ink.neokoni.lightTickets.platform.LightPlatform;
import ink.neokoni.lightTickets.platform.LightPlatformProvider;

public final class LightTicketsCore {
    public static void enable(LightPlatform platform) {
        LightPlatformProvider.set(platform);

        ConfigUtils.loadAllConfigs();
        Templates.startRefreshTask();
        DataRefreshManager.start();
        WebSocketClient.start();
    }

    public static void disable() {
        WebSocketClient.shutdown();
        DataRefreshManager.shutdown();
        AddComment.clearSessions();
        CreateTicket.clearSessions();
        PlayerData.clearAll();
        TicketInfo.clearPlayerComments();
    }
}
