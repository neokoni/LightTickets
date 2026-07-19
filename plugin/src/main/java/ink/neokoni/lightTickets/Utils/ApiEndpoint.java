package ink.neokoni.lightTickets.Utils;

public enum ApiEndpoint {
    TEMPLATES("GET", "/api/templates", false),
    TEMPLATE_DETAIL("GET", "/api/templates/{name}", false),
    MC_TICKET_DETAIL("GET", "/api/mc/tickets/{id}/detail", true),
    MC_TICKET_COMMENTS("GET", "/api/mc/tickets/{id}/comments", true),
    MC_REGISTER("POST", "/api/mc/register", true),
    MC_LINK_CODE("POST", "/api/mc/link-code", true),
    MC_CREATE_TICKET("POST", "/api/mc/tickets", true),
    MC_TICKET_LIST("GET", "/api/mc/tickets", true),
    MC_USER("GET", "/api/mc/user/{uuid}", true),
    MC_CREATE_COMMENT("POST", "/api/mc/comments", true),
    MC_UPDATE_TICKET_STATUS("POST", "/api/mc/tickets/{id}/status", true),
    MC_UNLINK("POST", "/api/mc/unlink", true);

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
}
