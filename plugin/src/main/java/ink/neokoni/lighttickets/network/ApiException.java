package ink.neokoni.lighttickets.network;

public class ApiException extends Exception {
    private final int statusCode;
    private final String responseBody;

    public ApiException(int statusCode, String responseBody) {
        super("API error " + statusCode + ": " + responseBody);
        this.statusCode = statusCode;
        this.responseBody = responseBody;
    }

    public int getStatusCode() { return statusCode; }
    public String getResponseBody() { return responseBody; }
}
