package ink.neokoni.lightTickets.Utils;

import java.util.Map;

public enum ApiEndpoint {
    HEALTH("GET", "/api/health", false),
    TEMPLATES("GET", "/api/templates", false),
    TEMPLATE_DETAIL("GET", "/api/templates/{name}", false),
    MC_TICKET_DETAIL("GET", "/api/mc/tickets/{id}/detail", true),
    MC_TICKET_DETAIL_BODY("POST", "/api/mc/tickets/{id}/detail", true),
    MC_TICKET_COMMENTS("GET", "/api/mc/tickets/{id}/comments", true),
    MC_TICKET_COMMENTS_BODY("POST", "/api/mc/tickets/{id}/comments/list", true),
    MC_LINK_CODE("POST", "/api/mc/link-code", true),
    MC_PLAYER_SESSION("POST", "/api/mc/session", true),
    MC_CREATE_TICKET("POST", "/api/mc/tickets", true),
    MC_PLAYER_GROUP_ITEM("POST", "/api/mc/player-group/items", true),
    MC_TICKET_LIST("GET", "/api/mc/tickets", true),
    MC_TICKET_SEARCH("POST", "/api/mc/tickets/search", true),
    MC_USER("GET", "/api/mc/user/{minecraftUuid}", true),
    MC_USER_BODY("POST", "/api/mc/user", true),
    MC_CREATE_COMMENT("POST", "/api/mc/comments", true),
    MC_UPDATE_TICKET_STATUS("POST", "/api/mc/tickets/{id}/status", true);

    // Path placeholder names also name the JSON body fields of the body variant.
    private static final Map<ApiEndpoint, ApiEndpoint> BODY_VARIANTS = Map.of(
            MC_TICKET_LIST, MC_TICKET_SEARCH,
            MC_TICKET_DETAIL, MC_TICKET_DETAIL_BODY,
            MC_TICKET_COMMENTS, MC_TICKET_COMMENTS_BODY,
            MC_USER, MC_USER_BODY);

    private final String method;
    private final String path;
    private final boolean serverAuthenticated;

    ApiEndpoint(String method, String path, boolean serverAuthenticated) {
        this.method = method;
        this.path = path;
        this.serverAuthenticated = serverAuthenticated;
    }

    public String method() {
        return method;
    }

    public String path() {
        return path;
    }

    public boolean serverAuthenticated() {
        return serverAuthenticated;
    }

    /**
     * Endpoint accepting the same parameters in a JSON body instead of the query string, or null
     * when the endpoint has no body variant.
     */
    public ApiEndpoint bodyVariant() {
        return BODY_VARIANTS.get(this);
    }
}
